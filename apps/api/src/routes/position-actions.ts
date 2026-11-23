import { dammPoolAbi, dlmmPoolV2Abi, getFomeoraDeployment, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { encodeFunctionData, parseAbi, parseUnits, toHex, type Address } from 'viem';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import type { ApiChainClient } from '../core/chain-client.js';
import { allocateRangeAmounts, minimumShares, type PositionShape } from '../core/positions/allocation.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase() as Address);
const paramsSchema = z.object({ id: z.string().regex(/^\d+$/).transform(BigInt) });
const commonSchema = z.object({ walletAddress: addressSchema, slippageBps: z.number().int().min(1).max(1_000).default(50) });
const increaseSchema = commonSchema.extend({
  amountX: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
  amountY: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
});
const decreaseSchema = commonSchema.extend({ bps: z.number().int().min(1).max(9_999) });
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const DEADLINE_SECONDS = 10 * 60;

class PositionActionError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

async function safeBlock(chainId: number): Promise<bigint> {
  const health = await prisma.indexerHealth.findUnique({ where: { chainId } });
  if (!health?.lastSuccessAt || Date.now() - health.lastSuccessAt.getTime() > 5 * 60_000) {
    throw new PositionActionError(503, 'INDEXER_NOT_READY');
  }
  return health.safeBlock;
}

async function loadPosition(chainId: number, id: bigint) {
  return prisma.position.findUnique({
    where: { chainId_id: { chainId, id }, canonical: true },
    include: { bins: { orderBy: { binId: 'asc' } }, pool: true },
  });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof PositionActionError) return reply.status(error.status).send({ error: error.code });
  if (error instanceof RangeError) return reply.status(400).send({ error: error.message });
  return reply.status(500).send({ error: 'POSITION_ACTION_FAILED' });
}

function shapeName(shape: number): PositionShape {
  return shape === 0 ? 'spot' : shape === 1 ? 'curve' : 'bid-ask';
}

async function exactApprovals(
  client: ApiChainClient, chainId: number, wallet: Address, spender: Address,
  tokens: readonly [Address, Address], amounts: readonly [bigint, bigint],
) {
  return (await Promise.all(tokens.map(async (token, index) => {
    const amount = amounts[index]!;
    if (amount === 0n) return null;
    const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [wallet, spender] });
    if (allowance === amount) return null;
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
    const gas = await client.estimateGas({ account: wallet, to: token, data, value: 0n });
    return { chainId, to: token, data, value: '0x0', gas: toHex(gas) };
  }))).filter(approval => approval !== null);
}

async function authorizedPosition(
  chainId: number, id: bigint, wallet: Address,
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>, client: ApiChainClient,
) {
  if (!session.user.wallets.some(linked => linked.address.toLowerCase() === wallet)) {
    throw new PositionActionError(403, 'WALLET_NOT_LINKED');
  }
  const position = await loadPosition(chainId, id);
  if (!position || position.status !== 'open') throw new PositionActionError(404, 'OPEN_POSITION_NOT_FOUND');
  if (position.owner.toLowerCase() !== wallet) throw new PositionActionError(403, 'POSITION_OWNERSHIP_REQUIRED');
  const manager = getFomeoraDeployment(chainId).positionManagerV2 as Address;
  try {
    const owner = await client.readContract({ address: manager, abi: positionManagerV2Abi, functionName: 'ownerOf', args: [id] });
    if (owner.toLowerCase() !== wallet) throw new PositionActionError(403, 'POSITION_OWNERSHIP_REQUIRED');
  } catch (error) {
    if (error instanceof PositionActionError) throw error;
    throw new PositionActionError(409, 'POSITION_OWNERSHIP_UNAVAILABLE');
  }
  return { position, manager };
}

export async function registerPositionActionRoutes(
  app: FastifyInstance, chainId: number, client: ApiChainClient,
  blockProvider: (chainId: number) => Promise<bigint> = safeBlock,
) {
  // DAMM and DLMM intentionally share authorization and response invariants.
  // eslint-disable-next-line complexity
  app.post('/v1/positions/:id/increase-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = paramsSchema.safeParse(request.params);
    const body = increaseSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_POSITION_INCREASE' });
    try {
      const { position, manager } = await authorizedPosition(chainId, params.data.id, body.data.walletAddress, session, client);
      if (position.pool.tokenXDecimals === null || position.pool.tokenYDecimals === null) throw new PositionActionError(409, 'TOKEN_DECIMALS_UNAVAILABLE');
      let amount0: bigint;
      let amount1: bigint;
      try {
        amount0 = parseUnits(body.data.amountX, position.pool.tokenXDecimals);
        amount1 = parseUnits(body.data.amountY, position.pool.tokenYDecimals);
      } catch { throw new PositionActionError(400, 'INVALID_TOKEN_AMOUNT'); }
      if (amount0 === 0n && amount1 === 0n) throw new PositionActionError(400, 'INVALID_TOKEN_AMOUNT');
      const blockNumber = await blockProvider(chainId);
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + DEADLINE_SECONDS);
      let data: `0x${string}`;
      const quoted0 = amount0;
      const quoted1 = amount1;
      if (position.pool.type === 'DLMM') {
        const activeBin = await client.readContract({ address: position.pool.address as Address, abi: dlmmPoolV2Abi, functionName: 'activeBin', blockNumber });
        const ownedBins = position.bins.map(bin => bin.binId);
        if (ownedBins.length === 0) throw new PositionActionError(409, 'POSITION_BINS_UNAVAILABLE');
        const allocation = allocateRangeAmounts({ bins: ownedBins, activeBin, amount0, amount1, shape: shapeName(position.shape) });
        const selected = ownedBins.map((binId, index) => ({ binId, amount0: allocation.amounts0[index]!, amount1: allocation.amounts1[index]! }))
          .filter(bin => bin.amount0 !== 0n || bin.amount1 !== 0n);
        const states = await Promise.all(selected.map(bin => client.readContract({ address: position.pool.address as Address, abi: dlmmPoolV2Abi, functionName: 'binState', args: [bin.binId], blockNumber })));
        const mins = selected.map((bin, index) => minimumShares({
          bin: { binId: bin.binId, reserve0: states[index]![0], reserve1: states[index]![1], totalShares: states[index]![2] },
          amount0: bin.amount0, amount1: bin.amount1, binStepBps: position.pool.binStep,
          decimals0: position.pool.tokenXDecimals!, decimals1: position.pool.tokenYDecimals!, slippageBps: body.data.slippageBps,
        }));
        data = encodeFunctionData({ abi: positionManagerV2Abi, functionName: 'increaseRange', args: [
          params.data.id, activeBin, selected.map(bin => bin.binId), selected.map(bin => bin.amount0), selected.map(bin => bin.amount1), mins, deadline,
        ] });
      } else {
        if (amount0 === 0n || amount1 === 0n) throw new PositionActionError(400, 'DAMM_REQUIRES_BOTH_TOKENS');
        const [reserve0, reserve1, totalShares] = await Promise.all([
          client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'reserve0', blockNumber }),
          client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'reserve1', blockNumber }),
          client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'totalShares', blockNumber }),
        ]);
        if (reserve0 === 0n || reserve1 === 0n || totalShares === 0n) throw new PositionActionError(409, 'DAMM_STATE_UNAVAILABLE');
        const shares = (amount0 * totalShares / reserve0) < (amount1 * totalShares / reserve1)
          ? amount0 * totalShares / reserve0 : amount1 * totalShares / reserve1;
        const minShares = shares * BigInt(10_000 - body.data.slippageBps) / 10_000n;
        data = encodeFunctionData({ abi: positionManagerV2Abi, functionName: 'increaseDamm', args: [params.data.id, amount0, amount1, minShares, deadline] });
      }
      const approvals = await exactApprovals(client, chainId, body.data.walletAddress, manager,
        [position.pool.tokenX as Address, position.pool.tokenY as Address], [quoted0, quoted1]);
      let gas: bigint | null = null;
      if (approvals.length === 0) {
        try { gas = await client.estimateGas({ account: body.data.walletAddress, to: manager, data, value: 0n }); }
        catch { throw new PositionActionError(409, 'POSITION_SIMULATION_FAILED'); }
      }
      return {
        quote: { positionId: position.id.toString(), action: 'increase', amountXRaw: quoted0.toString(), amountYRaw: quoted1.toString(), slippageBps: body.data.slippageBps, blockNumber: blockNumber.toString() },
        approvals, action: { chainId, to: manager, data, value: '0x0', ...(gas === null ? {} : { gas: toHex(gas) }) },
      };
    } catch (error) { return sendError(reply, error); }
  });

  // eslint-disable-next-line complexity
  const removal = (close: boolean) => async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = paramsSchema.safeParse(request.params);
    const body = (close ? commonSchema : decreaseSchema).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_POSITION_REMOVAL' });
    try {
      const { position, manager } = await authorizedPosition(chainId, params.data.id, body.data.walletAddress, session, client);
      const blockNumber = await blockProvider(chainId);
      const bps = close ? 10_000 : (body.data as z.infer<typeof decreaseSchema>).bps;
      let amount0 = 0n;
      let amount1 = 0n;
      if (position.pool.type === 'DLMM') {
        for (const bin of position.bins) {
          const [owned, state] = await Promise.all([
            client.readContract({ address: manager, abi: positionManagerV2Abi, functionName: 'binShares', args: [params.data.id, bin.binId], blockNumber }),
            client.readContract({ address: position.pool.address as Address, abi: dlmmPoolV2Abi, functionName: 'binState', args: [bin.binId], blockNumber }),
          ]);
          const removing = close ? owned : owned * BigInt(bps) / 10_000n;
          if (state[2] !== 0n) { amount0 += removing * state[0] / state[2]; amount1 += removing * state[1] / state[2]; }
        }
      } else {
        const [owned, reserve0, reserve1, totalShares] = await Promise.all([
          client.readContract({ address: manager, abi: positionManagerV2Abi, functionName: 'dammShares', args: [params.data.id], blockNumber }),
          client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'reserve0', blockNumber }),
          client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'reserve1', blockNumber }),
          client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'totalShares', blockNumber }),
        ]);
        const removing = close ? owned : owned * BigInt(bps) / 10_000n;
        if (totalShares !== 0n) { amount0 = removing * reserve0 / totalShares; amount1 = removing * reserve1 / totalShares; }
      }
      const min0 = amount0 * BigInt(10_000 - body.data.slippageBps) / 10_000n;
      const min1 = amount1 * BigInt(10_000 - body.data.slippageBps) / 10_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + DEADLINE_SECONDS);
      const functionName = position.pool.type === 'DLMM'
        ? (close ? 'closeRange' : 'decreaseRange') : (close ? 'closeDamm' : 'decreaseDamm');
      const args = close
        ? [params.data.id, min0, min1, body.data.walletAddress, deadline]
        : [params.data.id, bps, min0, min1, body.data.walletAddress, deadline];
      const data = encodeFunctionData({ abi: positionManagerV2Abi, functionName, args } as never);
      let gas: bigint;
      try { gas = await client.estimateGas({ account: body.data.walletAddress, to: manager, data, value: 0n }); }
      catch { throw new PositionActionError(409, 'POSITION_SIMULATION_FAILED'); }
      return {
        quote: { positionId: position.id.toString(), action: close ? 'close' : 'decrease', amountXRaw: amount0.toString(), amountYRaw: amount1.toString(), minimumAmountXRaw: min0.toString(), minimumAmountYRaw: min1.toString(), slippageBps: body.data.slippageBps, blockNumber: blockNumber.toString() },
        approvals: [], action: { chainId, to: manager, data, value: '0x0', gas: toHex(gas) },
      };
    } catch (error) { return sendError(reply, error); }
  };
  app.post('/v1/positions/:id/decrease-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, removal(false) as never);
  app.post('/v1/positions/:id/close-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, removal(true) as never);
}
