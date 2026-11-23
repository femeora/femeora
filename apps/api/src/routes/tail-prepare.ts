import { dammPoolAbi, dlmmPoolV2Abi, getFomeoraDeployment, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { encodeFunctionData, parseAbi, parseUnits, toHex, type Address, type Hex } from 'viem';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import { visibleCalloutWhere } from '../core/callouts/view.js';
import type { ApiChainClient } from '../core/chain-client.js';
import { allocateRangeAmounts, MAX_POSITION_BINS, minimumShares, type PositionShape } from '../core/positions/allocation.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase() as Address);
const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  mode: z.enum(['same_range', 'same_shape_now']),
  walletAddress: addressSchema,
  intentId: z.string().uuid(),
  amountX: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
  amountY: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
  slippageBps: z.number().int().min(1).max(1_000).default(50),
});
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const DEADLINE_SECONDS = 10 * 60;

class TailPrepareError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

async function safeBlock(chainId: number): Promise<bigint> {
  const health = await prisma.indexerHealth.findUnique({ where: { chainId } });
  if (!health?.lastSuccessAt || Date.now() - health.lastSuccessAt.getTime() > 5 * 60_000) throw new TailPrepareError(503, 'INDEXER_NOT_READY');
  return health.safeBlock;
}

function centeredRange(lowerBin: number, upperBin: number, activeBin: number) {
  const width = upperBin - lowerBin;
  let lower = activeBin - Math.floor(width / 2);
  let upper = lower + width;
  if (lower < -10_000) { lower = -10_000; upper = lower + width; }
  if (upper > 10_000) { upper = 10_000; lower = upper - width; }
  return { lower, upper };
}

function shapeName(shape: number): PositionShape {
  if (shape === 0) return 'spot';
  if (shape === 1) return 'curve';
  if (shape === 2) return 'bid-ask';
  throw new TailPrepareError(409, 'CUSTOM_SHAPE_UNSUPPORTED');
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof TailPrepareError) return reply.status(error.status).send({ error: error.code });
  if (error instanceof RangeError) return reply.status(400).send({ error: error.message });
  return reply.status(500).send({ error: 'TAIL_PREPARATION_FAILED' });
}

export async function registerTailPrepareRoutes(
  app: FastifyInstance, chainId: number, client: ApiChainClient,
  blockProvider: (chainId: number) => Promise<bigint> = safeBlock,
) {
  // DAMM and DLMM use distinct exact liquidity math behind one authenticated boundary.
  // eslint-disable-next-line complexity
  app.post('/v1/callouts/:id/tail-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = paramsSchema.safeParse(request.params);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_TAIL_PREPARATION' });
    if (!session.user.wallets.some(wallet => wallet.address.toLowerCase() === body.data.walletAddress)) return reply.status(403).send({ error: 'LINKED_WALLET_REQUIRED' });
    try {
      const source = await prisma.callout.findFirst({
        where: { id: params.data.id, chainId, ...visibleCalloutWhere },
        select: {
          id: true, poolId: true,
          position: { select: { owner: true, status: true, lowerBin: true, upperBin: true, shape: true } },
          pool: { select: { address: true, type: true, tokenX: true, tokenY: true, tokenXDecimals: true, tokenYDecimals: true, binStep: true, canonical: true } },
        },
      });
      if (!source?.pool.canonical) throw new TailPrepareError(404, 'CALLOUT_NOT_FOUND');
      if (source.position.status !== 'open') throw new TailPrepareError(409, 'SOURCE_POSITION_NOT_OPEN');
      if (source.position.owner.toLowerCase() === body.data.walletAddress) throw new TailPrepareError(409, 'SELF_TAIL_NOT_ALLOWED');
      const intent = await prisma.calloutIntent.findFirst({
        where: {
          id: body.data.intentId, userId: session.userId, chainId, poolId: source.poolId,
          sourceCalloutId: source.id, kind: 'tail', mode: body.data.mode,
          consumedAt: null, expiresAt: { gt: new Date() },
        },
      });
      if (!intent?.referrer || intent.referrer.toLowerCase() !== source.position.owner.toLowerCase()) throw new TailPrepareError(404, 'TAIL_INTENT_NOT_FOUND');
      if (source.pool.tokenXDecimals === null || source.pool.tokenYDecimals === null) throw new TailPrepareError(409, 'TOKEN_DECIMALS_UNAVAILABLE');
      let amount0: bigint;
      let amount1: bigint;
      try { amount0 = parseUnits(body.data.amountX, source.pool.tokenXDecimals); amount1 = parseUnits(body.data.amountY, source.pool.tokenYDecimals); }
      catch { throw new TailPrepareError(400, 'INVALID_TOKEN_AMOUNT'); }
      if (amount0 === 0n && amount1 === 0n) throw new TailPrepareError(400, 'INVALID_TOKEN_AMOUNT');
      const blockNumber = await blockProvider(chainId);
      const manager = getFomeoraDeployment(chainId).positionManagerV2 as Address;
      const poolAddress = source.pool.address as Address;
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + DEADLINE_SECONDS);
      let data: Hex;
      let quote: Record<string, unknown>;
      if (source.pool.type === 'DLMM') {
        const activeBin = await client.readContract({ address: poolAddress, abi: dlmmPoolV2Abi, functionName: 'activeBin', blockNumber });
        const target = body.data.mode === 'same_shape_now'
          ? centeredRange(source.position.lowerBin, source.position.upperBin, activeBin)
          : { lower: source.position.lowerBin, upper: source.position.upperBin };
        const count = target.upper - target.lower + 1;
        if (count < 1 || count > MAX_POSITION_BINS) throw new TailPrepareError(409, 'TAIL_RANGE_TOO_WIDE');
        const requestedBins = Array.from({ length: count }, (_, index) => target.lower + index);
        const allocation = allocateRangeAmounts({ bins: requestedBins, activeBin, amount0, amount1, shape: shapeName(source.position.shape) });
        const selected = requestedBins.map((binId, index) => ({ binId, amount0: allocation.amounts0[index]!, amount1: allocation.amounts1[index]! }))
          .filter(bin => bin.amount0 !== 0n || bin.amount1 !== 0n);
        const states = await Promise.all(selected.map(bin => client.readContract({ address: poolAddress, abi: dlmmPoolV2Abi, functionName: 'binState', args: [bin.binId], blockNumber })));
        const mins = selected.map((bin, index) => minimumShares({
          bin: { binId: bin.binId, reserve0: states[index]![0], reserve1: states[index]![1], totalShares: states[index]![2] },
          amount0: bin.amount0, amount1: bin.amount1, binStepBps: source.pool.binStep,
          decimals0: source.pool.tokenXDecimals!, decimals1: source.pool.tokenYDecimals!, slippageBps: body.data.slippageBps,
        }));
        data = encodeFunctionData({ abi: positionManagerV2Abi, functionName: 'createRangePosition', args: [{
          pool: poolAddress, shape: source.position.shape, tag: intent.tag as Hex, referrer: intent.referrer as Address,
          expectedActiveBin: activeBin, bins: selected.map(bin => bin.binId), amountsX: selected.map(bin => bin.amount0), amountsY: selected.map(bin => bin.amount1), minShares: mins, deadline,
        }] });
        quote = { mode: body.data.mode, pool: source.pool.address, poolType: 'DLMM', expectedActiveBin: activeBin, lowerBin: target.lower, upperBin: target.upper, shape: source.position.shape, requiresTokenX: target.upper >= activeBin, requiresTokenY: target.lower < activeBin, warnings: [], amountXRaw: amount0.toString(), amountYRaw: amount1.toString(), blockNumber: blockNumber.toString() };
      } else {
        if (amount0 === 0n || amount1 === 0n) throw new TailPrepareError(400, 'DAMM_REQUIRES_BOTH_TOKENS');
        const [reserve0, reserve1, totalShares] = await Promise.all([
          client.readContract({ address: poolAddress, abi: dammPoolAbi, functionName: 'reserve0', blockNumber }),
          client.readContract({ address: poolAddress, abi: dammPoolAbi, functionName: 'reserve1', blockNumber }),
          client.readContract({ address: poolAddress, abi: dammPoolAbi, functionName: 'totalShares', blockNumber }),
        ]);
        if (reserve0 === 0n || reserve1 === 0n || totalShares === 0n) throw new TailPrepareError(409, 'DAMM_STATE_UNAVAILABLE');
        const share0 = amount0 * totalShares / reserve0;
        const share1 = amount1 * totalShares / reserve1;
        const minShares = (share0 < share1 ? share0 : share1) * BigInt(10_000 - body.data.slippageBps) / 10_000n;
        data = encodeFunctionData({ abi: positionManagerV2Abi, functionName: 'createDammPosition', args: [{
          pool: poolAddress, amountX: amount0, amountY: amount1, minShares, tag: intent.tag as Hex, referrer: intent.referrer as Address, deadline,
        }] });
        quote = { mode: body.data.mode, pool: source.pool.address, poolType: 'DAMM', expectedActiveBin: null, lowerBin: null, upperBin: null, shape: source.position.shape, requiresTokenX: true, requiresTokenY: true, warnings: [], amountXRaw: amount0.toString(), amountYRaw: amount1.toString(), blockNumber: blockNumber.toString() };
      }
      const tokens = [source.pool.tokenX as Address, source.pool.tokenY as Address] as const;
      const amounts = [amount0, amount1] as const;
      const approvals = (await Promise.all(tokens.map(async (token, index) => {
        const amount = amounts[index]!; if (amount === 0n) return null;
        const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [body.data.walletAddress, manager] });
        if (allowance === amount) return null;
        const approvalData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [manager, amount] });
        const gas = await client.estimateGas({ account: body.data.walletAddress, to: token, data: approvalData, value: 0n });
        return { chainId, to: token, data: approvalData, value: '0x0', gas: toHex(gas) };
      }))).filter(approval => approval !== null);
      let gas: bigint | null = null;
      if (approvals.length === 0) {
        try { gas = await client.estimateGas({ account: body.data.walletAddress, to: manager, data, value: 0n }); }
        catch { throw new TailPrepareError(409, 'TAIL_SIMULATION_FAILED'); }
      }
      return { quote, approvals, create: { chainId, to: manager, data, value: '0x0', ...(gas === null ? {} : { gas: toHex(gas) }) } };
    } catch (error) { return sendError(reply, error); }
  });
}
