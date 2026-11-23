import { dlmmPoolV2Abi, getFomeoraDeployment, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { encodeFunctionData, formatUnits, parseAbi, parseUnits, toHex, type Address, type Hex } from 'viem';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import type { ApiChainClient } from '../core/chain-client.js';
import {
  allocateRangeAmounts,
  minimumShares,
  rangeBins,
  type PositionShape,
} from '../core/positions/allocation.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase() as Address);
const paramsSchema = z.object({ pool: addressSchema });
const requestSchema = z.object({
  shape: z.enum(['spot', 'curve', 'bid-ask']),
  minPct: z.number().finite().gt(-100).lt(1_000),
  maxPct: z.number().finite().gt(-100).lt(1_000),
  amountX: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
  amountY: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
  slippageBps: z.number().int().min(1).max(1_000).default(50),
});
const prepareSchema = requestSchema.extend({
  walletAddress: addressSchema,
  intentId: z.string().uuid().nullable().default(null),
});
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ZERO_TAG = `0x${'0'.repeat(64)}` as Hex;
const DEADLINE_SECONDS = 10 * 60;

class PositionCreateError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

async function safeBlock(chainId: number): Promise<bigint> {
  const health = await prisma.indexerHealth.findUnique({ where: { chainId } });
  if (!health?.lastSuccessAt || Date.now() - health.lastSuccessAt.getTime() > 5 * 60 * 1_000) {
    throw new PositionCreateError(503, 'INDEXER_NOT_READY');
  }
  return health.safeBlock;
}

async function canonicalPool(chainId: number, address: Address) {
  return prisma.pool.findFirst({
    where: { chainId, address, canonical: true, type: 'DLMM' },
    select: { id: true, address: true, tokenX: true, tokenY: true, tokenXDecimals: true, tokenYDecimals: true, binStep: true },
  });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof PositionCreateError) return reply.status(error.status).send({ error: error.code });
  if (error instanceof RangeError) return reply.status(400).send({ error: error.message });
  return reply.status(500).send({ error: 'POSITION_REQUEST_FAILED' });
}

async function buildQuote(
  chainId: number,
  client: ApiChainClient,
  pool: NonNullable<Awaited<ReturnType<typeof canonicalPool>>>,
  input: z.infer<typeof requestSchema>,
  blockProvider: (chainId: number) => Promise<bigint>,
) {
  if (pool.tokenXDecimals === null || pool.tokenYDecimals === null) {
    throw new PositionCreateError(409, 'TOKEN_DECIMALS_UNAVAILABLE');
  }
  let amount0: bigint;
  let amount1: bigint;
  try {
    amount0 = parseUnits(input.amountX, pool.tokenXDecimals);
    amount1 = parseUnits(input.amountY, pool.tokenYDecimals);
  } catch {
    throw new PositionCreateError(400, 'INVALID_TOKEN_AMOUNT');
  }
  if (amount0 === 0n && amount1 === 0n) throw new PositionCreateError(400, 'INVALID_TOKEN_AMOUNT');
  const blockNumber = await blockProvider(chainId);
  const poolAddress = pool.address as Address;
  const activeBin = await client.readContract({
    address: poolAddress, abi: dlmmPoolV2Abi, functionName: 'activeBin', blockNumber,
  });
  const requestedBins = rangeBins(activeBin, input.minPct, input.maxPct, pool.binStep);
  const requestedAllocation = allocateRangeAmounts({ bins: requestedBins, activeBin, amount0, amount1, shape: input.shape });
  // Very small raw amounts can produce zero allocations. Omit those bins because the contract rejects zero-value additions.
  const selected = requestedBins.map((binId, index) => ({
    binId, amount0: requestedAllocation.amounts0[index]!, amount1: requestedAllocation.amounts1[index]!,
  })).filter(bin => bin.amount0 !== 0n || bin.amount1 !== 0n);
  if (selected.length === 0) throw new PositionCreateError(400, 'DEPOSIT_TOO_SMALL');
  const bins = selected.map(bin => bin.binId);
  const allocation = { amounts0: selected.map(bin => bin.amount0), amounts1: selected.map(bin => bin.amount1) };
  const states = await Promise.all(bins.map(binId => client.readContract({
    address: poolAddress, abi: dlmmPoolV2Abi, functionName: 'binState', args: [binId], blockNumber,
  })));
  const minShares = states.map((state, index) => minimumShares({
    bin: { binId: bins[index]!, reserve0: state[0], reserve1: state[1], totalShares: state[2] },
    amount0: allocation.amounts0[index]!, amount1: allocation.amounts1[index]!,
    binStepBps: pool.binStep, decimals0: pool.tokenXDecimals!, decimals1: pool.tokenYDecimals!,
    slippageBps: input.slippageBps,
  }));
  return {
    pool: pool.address, tokenX: pool.tokenX, tokenY: pool.tokenY,
    amountX: formatUnits(amount0, pool.tokenXDecimals), amountY: formatUnits(amount1, pool.tokenYDecimals),
    amountXRaw: amount0.toString(), amountYRaw: amount1.toString(), shape: input.shape,
    activeBin, bins, amountsXRaw: allocation.amounts0.map(String), amountsYRaw: allocation.amounts1.map(String),
    minimumSharesRaw: minShares.map(String), slippageBps: input.slippageBps, blockNumber: blockNumber.toString(),
  };
}

function shapeCode(shape: PositionShape): number {
  return shape === 'spot' ? 0 : shape === 'curve' ? 1 : 2;
}

export async function registerPositionCreateRoutes(
  app: FastifyInstance,
  chainId: number,
  client: ApiChainClient,
  blockProvider: (chainId: number) => Promise<bigint> = safeBlock,
) {
  app.post('/v1/pools/:pool/position-quote', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = requestSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_POSITION_QUOTE' });
    try {
      const pool = await canonicalPool(chainId, params.data.pool);
      if (!pool) throw new PositionCreateError(404, 'POOL_NOT_FOUND');
      return await buildQuote(chainId, client, pool, body.data, blockProvider);
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/v1/pools/:pool/position-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = paramsSchema.safeParse(request.params);
    const body = prepareSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_POSITION_PREPARATION' });
    if (!session.user.wallets.some(wallet => wallet.address.toLowerCase() === body.data.walletAddress)) {
      return reply.status(403).send({ error: 'WALLET_NOT_LINKED' });
    }
    try {
      const pool = await canonicalPool(chainId, params.data.pool);
      if (!pool) throw new PositionCreateError(404, 'POOL_NOT_FOUND');
      const quote = await buildQuote(chainId, client, pool, body.data, blockProvider);
      let tag = ZERO_TAG;
      if (body.data.intentId) {
        const intent = await prisma.calloutIntent.findFirst({
          where: { id: body.data.intentId, userId: session.userId, chainId, poolId: pool.id, consumedAt: null, expiresAt: { gt: new Date() } },
          select: { tag: true },
        });
        if (!intent) throw new PositionCreateError(404, 'CALLOUT_INTENT_NOT_FOUND');
        tag = intent.tag as Hex;
      }
      const manager = getFomeoraDeployment(chainId).positionManagerV2 as Address;
      const totals = [BigInt(quote.amountXRaw), BigInt(quote.amountYRaw)] as const;
      const tokens = [pool.tokenX as Address, pool.tokenY as Address] as const;
      const approvals = await Promise.all(tokens.map(async (token, index) => {
        const amount = totals[index]!;
        if (amount === 0n) return null;
        const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [body.data.walletAddress, manager] });
        if (allowance === amount) return null;
        const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [manager, amount] });
        const gas = await client.estimateGas({ account: body.data.walletAddress, to: token, data, value: 0n });
        return { chainId, to: token, data, value: '0x0', gas: toHex(gas) };
      }));
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + DEADLINE_SECONDS);
      const data = encodeFunctionData({
        abi: positionManagerV2Abi, functionName: 'createRangePosition',
        args: [{
          pool: pool.address as Address, shape: shapeCode(quote.shape), tag, referrer: ZERO_ADDRESS,
          expectedActiveBin: quote.activeBin, bins: quote.bins,
          amountsX: quote.amountsXRaw.map(BigInt), amountsY: quote.amountsYRaw.map(BigInt),
          minShares: quote.minimumSharesRaw.map(BigInt), deadline,
        }],
      });
      let gas: bigint | null = null;
      if (approvals.every(approval => approval === null)) {
        try { gas = await client.estimateGas({ account: body.data.walletAddress, to: manager, data, value: 0n }); }
        catch { throw new PositionCreateError(409, 'POSITION_SIMULATION_FAILED'); }
      }
      return {
        quote, approvals: approvals.filter(approval => approval !== null),
        create: { chainId, to: manager, data, value: '0x0', ...(gas === null ? {} : { gas: toHex(gas) }) },
      };
    } catch (error) { return sendError(reply, error); }
  });
}
