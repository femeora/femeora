import { prisma } from '@fomeora/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase());
const poolParamsSchema = z.object({ pool: addressSchema });
const limitSchema = z.coerce.number().int().min(1).max(200).default(50);

function serializePool(pool: {
  id: string;
  chainId: number;
  address: string;
  type: string;
  tokenX: string;
  tokenY: string;
  quoteToken: string | null;
  binStep: number;
  baseFeePips: number;
  createdBlock: bigint;
}) {
  return {
    ...pool,
    createdBlock: pool.createdBlock.toString(),
  };
}

export async function registerPoolRoutes(app: FastifyInstance, chainId: number) {
  app.get('/v1/pools', async (request, reply) => {
    const parsed = z.object({ limit: limitSchema }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const pools = await prisma.pool.findMany({
      where: { chainId, canonical: true },
      orderBy: [{ createdBlock: 'desc' }, { address: 'asc' }],
      take: parsed.data.limit,
    });
    return { data: pools.map(serializePool) };
  });

  app.get('/v1/pools/:pool', async (request, reply) => {
    const parsed = poolParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_POOL_ADDRESS' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: parsed.data.pool, canonical: true },
      include: {
        _count: {
          select: {
            positions: { where: { canonical: true } },
            swaps: { where: { canonical: true } },
            callouts: { where: { canonical: true, hidden: false, deletedAt: null } },
          },
        },
      },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    return { ...serializePool(pool), counts: pool._count };
  });

  app.get('/v1/pools/:pool/stats', async (request, reply) => {
    const parsed = poolParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_POOL_ADDRESS' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: parsed.data.pool, canonical: true },
      select: { id: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    const [swaps, openPositions] = await Promise.all([
      prisma.swap.aggregate({
        where: { poolId: pool.id, canonical: true },
        _count: true,
        _sum: { amountIn: true, amountOut: true, totalFee: true, protocolFee: true },
      }),
      prisma.position.count({ where: { poolId: pool.id, status: 'open', canonical: true } }),
    ]);
    return {
      swapCount: swaps._count,
      openPositions,
      amountIn: swaps._sum.amountIn?.toString() ?? '0',
      amountOut: swaps._sum.amountOut?.toString() ?? '0',
      totalFee: swaps._sum.totalFee?.toString() ?? '0',
      protocolFee: swaps._sum.protocolFee?.toString() ?? '0',
    };
  });

  app.get('/v1/pools/:pool/bins', async (request, reply) => {
    const params = poolParamsSchema.safeParse(request.params);
    const query = z
      .object({
        from: z.coerce.number().int().min(-10_000).max(10_000),
        to: z.coerce.number().int().min(-10_000).max(10_000),
      })
      .safeParse(request.query);
    if (!params.success || !query.success || query.data.to < query.data.from || query.data.to - query.data.from > 399) {
      return reply.status(400).send({ error: 'INVALID_BIN_RANGE' });
    }
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: params.data.pool, canonical: true },
      select: { id: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    const bins = await prisma.bin.findMany({
      where: { poolId: pool.id, binId: { gte: query.data.from, lte: query.data.to } },
      orderBy: { binId: 'asc' },
    });
    return {
      data: bins.map(bin => ({
        binId: bin.binId,
        reserveX: bin.reserveX.toString(),
        reserveY: bin.reserveY.toString(),
        totalShares: bin.totalShares.toString(),
        updatedBlock: bin.updatedBlock.toString(),
      })),
    };
  });

  app.get('/v1/pools/:pool/trades', async (request, reply) => {
    const params = poolParamsSchema.safeParse(request.params);
    const query = z.object({ limit: limitSchema }).safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: params.data.pool, canonical: true },
      select: { id: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    const swaps = await prisma.swap.findMany({
      where: { poolId: pool.id, canonical: true },
      orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
      take: query.data.limit,
    });
    return {
      data: swaps.map(swap => ({
        transactionHash: swap.transactionHash,
        logIndex: swap.logIndex,
        blockNumber: swap.blockNumber.toString(),
        timestamp: swap.timestamp.toISOString(),
        sender: swap.sender,
        recipient: swap.recipient,
        tokenIn: swap.tokenIn,
        amountIn: swap.amountIn.toString(),
        amountOut: swap.amountOut.toString(),
        totalFee: swap.totalFee?.toString() ?? null,
        protocolFee: swap.protocolFee.toString(),
        activeBinBefore: swap.activeBinBefore,
        activeBinAfter: swap.activeBinAfter,
        binCrossings: swap.binCrossings,
      })),
    };
  });

  app.get('/v1/pools/:pool/candles', async (request, reply) => {
    const params = poolParamsSchema.safeParse(request.params);
    const query = z
      .object({
        interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: params.data.pool, canonical: true },
      select: { id: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    const candles = await prisma.candle.findMany({
      where: { poolId: pool.id, interval: query.data.interval },
      orderBy: { bucketStart: 'desc' },
      take: query.data.limit,
    });
    return {
      data: candles.reverse().map(candle => ({
        timestamp: candle.bucketStart.toISOString(),
        open: candle.open.toString(),
        high: candle.high.toString(),
        low: candle.low.toString(),
        close: candle.close.toString(),
        volumeX: candle.volumeX.toString(),
        volumeY: candle.volumeY.toString(),
        swapCount: candle.swapCount,
      })),
    };
  });

  app.get('/v1/pools/:pool/lps', async (request, reply) => {
    const params = poolParamsSchema.safeParse(request.params);
    const query = z.object({ limit: limitSchema }).safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: params.data.pool, canonical: true },
      select: { id: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    const positions = await prisma.position.findMany({
      where: { poolId: pool.id, status: 'open', canonical: true },
      orderBy: { valueQuote: 'desc' },
      take: query.data.limit,
    });
    return {
      data: positions.map(position => ({
        id: position.id.toString(),
        owner: position.owner,
        lowerBin: position.lowerBin,
        upperBin: position.upperBin,
        shape: position.shape,
        valueQuote: position.valueQuote?.toString() ?? null,
        earnedQuote: position.earnedQuote.toString(),
      })),
    };
  });
}
