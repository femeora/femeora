import { dammPoolAbi, dlmmPoolV2Abi, getFomeoraDeployment, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { encodeFunctionData, formatUnits, parseAbi, parseUnits, toHex, type Address } from 'viem';
import { z } from 'zod';

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
const smartRangeSchema = commonSchema.pick({ walletAddress: true }).extend({
  mode: z.enum(['follow-price', 'fee-focus', 'defensive']),
});
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

function centeredRange(activeBin: number, requestedCount: number) {
  const count = Math.max(1, Math.min(61, requestedCount % 2 === 0 ? requestedCount + 1 : requestedCount));
  const half = Math.floor(count / 2);
  let lowerBin = activeBin - half;
  let upperBin = activeBin + half;
  if (lowerBin < -10_000) { upperBin += -10_000 - lowerBin; lowerBin = -10_000; }
  if (upperBin > 10_000) { lowerBin -= upperBin - 10_000; upperBin = 10_000; }
  return { lowerBin, upperBin, binCount: upperBin - lowerBin + 1 };
}

async function positionAmountsAtBlock(
  position: Awaited<ReturnType<typeof loadPosition>> extends infer T ? NonNullable<T> : never,
  manager: Address,
  client: ApiChainClient,
  blockNumber: bigint,
) {
  let amount0 = 0n;
  let amount1 = 0n;
  if (position.pool.type === 'DLMM') {
    for (const bin of position.bins) {
      const [owned, state] = await Promise.all([
        client.readContract({ address: manager, abi: positionManagerV2Abi, functionName: 'binShares', args: [position.id, bin.binId], blockNumber }),
        client.readContract({ address: position.pool.address as Address, abi: dlmmPoolV2Abi, functionName: 'binState', args: [bin.binId], blockNumber }),
      ]);
      if (state[2] !== 0n) { amount0 += owned * state[0] / state[2]; amount1 += owned * state[1] / state[2]; }
    }
  } else {
    const [owned, reserve0, reserve1, totalShares] = await Promise.all([
      client.readContract({ address: manager, abi: positionManagerV2Abi, functionName: 'dammShares', args: [position.id], blockNumber }),
      client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'reserve0', blockNumber }),
      client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'reserve1', blockNumber }),
      client.readContract({ address: position.pool.address as Address, abi: dammPoolAbi, functionName: 'totalShares', blockNumber }),
    ]);
    if (totalShares !== 0n) { amount0 = owned * reserve0 / totalShares; amount1 = owned * reserve1 / totalShares; }
  }
  return { amount0, amount1 };
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
  chainId: number, id: bigint, wallet: Address, client: ApiChainClient,
) {
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
  app.post('/v1/positions/:id/smart-range-proposal', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = smartRangeSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_SMART_RANGE_REQUEST' });
    try {
      const { position, manager } = await authorizedPosition(chainId, params.data.id, body.data.walletAddress, client);
      if (position.pool.type !== 'DLMM') throw new PositionActionError(409, 'SMART_RANGE_REQUIRES_DLMM');
      if (position.pool.tokenXDecimals === null || position.pool.tokenYDecimals === null) throw new PositionActionError(409, 'TOKEN_DECIMALS_UNAVAILABLE');
      const blockNumber = await blockProvider(chainId);
      const activeBin = await client.readContract({
        address: position.pool.address as Address,
        abi: dlmmPoolV2Abi,
        functionName: 'activeBin',
        blockNumber,
      });
      const currentCount = Math.max(1, position.upperBin - position.lowerBin + 1);
      const requestedCount = body.data.mode === 'fee-focus'
        ? Math.min(currentCount, 21)
        : body.data.mode === 'defensive'
          ? Math.max(currentCount, 51)
          : currentCount;
      const proposed = centeredRange(activeBin, requestedCount);
      const { amount0, amount1 } = await positionAmountsAtBlock(position, manager, client, blockNumber);
      if (amount0 === 0n && amount1 === 0n) throw new PositionActionError(409, 'POSITION_VALUE_UNAVAILABLE');
      const reusable0 = amount0 * 9_950n / 10_000n;
      const reusable1 = amount1 * 9_950n / 10_000n;
      const proposedBins = Array.from({ length: proposed.binCount }, (_, index) => proposed.lowerBin + index);
      const proposedAllocation = allocateRangeAmounts({
        bins: proposedBins,
        activeBin,
        amount0: reusable0,
        amount1: reusable1,
        shape: shapeName(position.shape),
      });
      const fundedBins = proposedBins.filter((_, index) =>
        proposedAllocation.amounts0[index] !== 0n || proposedAllocation.amounts1[index] !== 0n
      );
      if (fundedBins.length === 0) throw new PositionActionError(409, 'SMART_RANGE_AMOUNT_TOO_SMALL');
      const executableRange = {
        lowerBin: fundedBins[0]!,
        upperBin: fundedBins.at(-1)!,
        binCount: fundedBins.length,
      };
      const openSeconds = BigInt(position.openSeconds.toString());
      const inRangeSeconds = BigInt(position.inRangeSeconds.toString());
      const inRangePercent = openSeconds === 0n ? 0 : Number(inRangeSeconds * 10_000n / openSeconds) / 100;
      const currentInRange = activeBin >= position.lowerBin && activeBin <= position.upperBin;
      const modeReason = body.data.mode === 'fee-focus'
        ? 'Uses a tighter range around the active bin to concentrate liquidity and fee exposure.'
        : body.data.mode === 'defensive'
          ? 'Uses a wider range around the active bin to reduce how often the position moves out of range.'
          : 'Keeps the current width and recenters it around the active bin.';
      return {
        positionId: position.id.toString(),
        mode: body.data.mode,
        blockNumber: blockNumber.toString(),
        activeBin,
        current: {
          lowerBin: position.lowerBin,
          upperBin: position.upperBin,
          binCount: currentCount,
          inRange: currentInRange,
          inRangePercent,
        },
        proposed: {
          ...executableRange,
          shape: shapeName(position.shape),
          amountX: formatUnits(reusable0, position.pool.tokenXDecimals),
          amountY: formatUnits(reusable1, position.pool.tokenYDecimals),
          amountXRaw: reusable0.toString(),
          amountYRaw: reusable1.toString(),
        },
        reasoning: [
          modeReason,
          currentInRange ? 'The current position is in range at the indexed safe block.' : 'The current position is out of range at the indexed safe block.',
          'The replacement amounts reserve 0.5% as execution headroom; any remainder stays in your wallet.',
        ],
        warnings: [
          'Rebalancing closes the old position before creating the replacement position.',
          'Price can move between signatures. Review every wallet request and estimated output.',
        ],
      };
    } catch (error) { return sendError(reply, error); }
  });

  // DAMM and DLMM intentionally share authorization and response invariants.
  // eslint-disable-next-line complexity
  app.post('/v1/positions/:id/increase-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = increaseSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_POSITION_INCREASE' });
    try {
      const { position, manager } = await authorizedPosition(chainId, params.data.id, body.data.walletAddress, client);
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
    const params = paramsSchema.safeParse(request.params);
    const body = (close ? commonSchema : decreaseSchema).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_POSITION_REMOVAL' });
    try {
      const { position, manager } = await authorizedPosition(chainId, params.data.id, body.data.walletAddress, client);
      const blockNumber = await blockProvider(chainId);
      const bps = close ? 10_000 : (body.data as z.infer<typeof decreaseSchema>).bps;
      const fullAmounts = await positionAmountsAtBlock(position, manager, client, blockNumber);
      const amount0 = close ? fullAmounts.amount0 : fullAmounts.amount0 * BigInt(bps) / 10_000n;
      const amount1 = close ? fullAmounts.amount1 : fullAmounts.amount1 * BigInt(bps) / 10_000n;
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
