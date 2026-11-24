import { prisma } from '@fomeora/database';
import { PRICE_SCALE, priceFromBinX18, rawUnitsToDecimal, token0Value, token1Value } from '@fomeora/sdk';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase());
const poolParamsSchema = z.object({ pool: addressSchema });
const limitSchema = z.coerce.number().int().min(1).max(200).default(50);
const CANDLE_INTERVAL_MS = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 } as const;

interface SerializedCandle {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volumeX: string;
  volumeY: string;
  volumeQuote: string | null;
  swapCount: number;
  synthetic: boolean;
  source?: 'pool' | 'reference';
  sourceUpdatedAt?: string;
  stale?: boolean;
}

export function fillCandleGaps(input: readonly SerializedCandle[], interval: keyof typeof CANDLE_INTERVAL_MS, limit: number, now = new Date()): SerializedCandle[] {
  if (input.length === 0) return [];
  const step = CANDLE_INTERVAL_MS[interval];
  const current = Math.floor(now.getTime() / step) * step;
  const earliestAllowed = current - (limit - 1) * step;
  const firstActual = new Date(input[0]!.timestamp).getTime();
  const start = Math.max(firstActual, earliestAllowed);
  const byTime = new Map(input.map(candle => [new Date(candle.timestamp).getTime(), candle]));
  let close = [...input].reverse().find(candle => new Date(candle.timestamp).getTime() <= start)?.close ?? input[0]!.close;
  const output: SerializedCandle[] = [];
  for (let timestamp = start; timestamp <= current && output.length < limit; timestamp += step) {
    const actual = byTime.get(timestamp);
    if (actual) {
      close = actual.close;
      output.push(actual);
    } else {
      output.push({
        timestamp: new Date(timestamp).toISOString(), open: close, high: close, low: close, close,
        volumeX: '0', volumeY: '0', volumeQuote: '0', swapCount: 0, synthetic: true,
        ...(input[0]!.source ? { source: input[0]!.source } : {}),
        ...(input[0]!.sourceUpdatedAt ? { sourceUpdatedAt: input[0]!.sourceUpdatedAt } : {}),
        ...(input[0]!.stale !== undefined ? { stale: input[0]!.stale } : {}),
      });
    }
  }
  return output;
}

export function serializePool(pool: {
  id: string;
  chainId: number;
  address: string;
  type: string;
  tokenX: string;
  tokenY: string;
  quoteToken: string | null;
  binStep: number;
  baseFeePips: number;
  reserveCapX: { toString(): string } | null;
  reserveCapY: { toString(): string } | null;
  reserveX: { toString(): string } | null;
  reserveY: { toString(): string } | null;
  reserveUpdatedBlock: bigint | null;
  createdBlock: bigint;
}) {
  return {
    ...pool,
    baseIsTokenX: pool.quoteToken
      ? pool.quoteToken.toLowerCase() === pool.tokenY.toLowerCase()
      : null,
    reserveCapX: pool.reserveCapX?.toString() ?? null,
    reserveCapY: pool.reserveCapY?.toString() ?? null,
    reserveX: pool.reserveX?.toString() ?? null,
    reserveY: pool.reserveY?.toString() ?? null,
    reserveUpdatedBlock: pool.reserveUpdatedBlock?.toString() ?? null,
    createdBlock: pool.createdBlock.toString(),
  };
}

export function binQuoteValues(pool: {
  tokenX: string;
  tokenY: string;
  quoteToken: string | null;
  tokenXDecimals: number | null;
  tokenYDecimals: number | null;
  binStep: number;
  activeBin: number | null;
}, bin: { binId: number; reserveX: bigint; reserveY: bigint }) {
  const quote = pool.quoteToken?.toLowerCase();
  const quoteIsY = quote === pool.tokenY.toLowerCase();
  const quoteIsX = quote === pool.tokenX.toLowerCase();
  const side = bin.binId === pool.activeBin ? 'active' : bin.binId > (pool.activeBin ?? bin.binId) ? 'base' : 'quote';
  if ((!quoteIsX && !quoteIsY) || pool.tokenXDecimals === null || pool.tokenYDecimals === null || pool.binStep === 0) {
    return { priceQuote: null, depthQuote: null, side };
  }
  const priceX18 = priceFromBinX18(bin.binId, pool.binStep);
  if (quoteIsY) {
    const depth = token1Value(bin.reserveX, bin.reserveY, priceX18, pool.tokenXDecimals, pool.tokenYDecimals);
    return {
      // BinPriceMath is already expressed as whole tokenY per whole tokenX.
      // Token decimals are used for reserve conversion, not for display price.
      priceQuote: rawUnitsToDecimal(priceX18, 18, 18),
      depthQuote: rawUnitsToDecimal(depth, pool.tokenYDecimals, 18),
      side,
    };
  }
  const inverseX18 = PRICE_SCALE * PRICE_SCALE / priceX18;
  const depth = token0Value(bin.reserveX, bin.reserveY, priceX18, pool.tokenXDecimals, pool.tokenYDecimals);
  return {
    priceQuote: rawUnitsToDecimal(inverseX18, 18, 18),
    depthQuote: rawUnitsToDecimal(depth, pool.tokenXDecimals, 18),
    side,
  };
}

function reserveCapStatus(pool: {
  reserveX: { toString(): string } | null;
  reserveY: { toString(): string } | null;
  reserveCapX: { toString(): string } | null;
  reserveCapY: { toString(): string } | null;
  reserveUpdatedBlock: bigint | null;
}) {
  if (!pool.reserveX || !pool.reserveY || !pool.reserveCapX || !pool.reserveCapY) {
    return {
      reserveX: null,
      reserveY: null,
      reserveUpdatedBlock: null,
      reserveUtilizationBps: null,
      reserveCapStatus: 'unavailable' as const,
    };
  }
  const reserveX = BigInt(pool.reserveX.toString());
  const reserveY = BigInt(pool.reserveY.toString());
  const capX = BigInt(pool.reserveCapX.toString());
  const capY = BigInt(pool.reserveCapY.toString());
  const utilizationX = capX === 0n ? null : reserveX * 10_000n / capX;
  const utilizationY = capY === 0n ? null : reserveY * 10_000n / capY;
  const utilization = utilizationX === null || utilizationY === null
    ? null
    : Number(utilizationX > utilizationY ? utilizationX : utilizationY);
  return {
    reserveX: reserveX.toString(),
    reserveY: reserveY.toString(),
    reserveUpdatedBlock: pool.reserveUpdatedBlock?.toString() ?? null,
    reserveUtilizationBps: utilization,
    reserveCapStatus: utilization === null
      ? 'unavailable' as const
      : utilization >= 9_000
        ? 'critical' as const
        : utilization >= 8_000
          ? 'warning' as const
          : 'normal' as const,
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
      select: {
        id: true,
        reserveX: true,
        reserveY: true,
        reserveCapX: true,
        reserveCapY: true,
        reserveUpdatedBlock: true,
      },
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
      ...reserveCapStatus(pool),
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
      select: {
        id: true, tokenX: true, tokenY: true, quoteToken: true,
        tokenXDecimals: true, tokenYDecimals: true, binStep: true, activeBin: true,
      },
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
        ...binQuoteValues(pool, {
          binId: bin.binId,
          reserveX: BigInt(bin.reserveX.toString()),
          reserveY: BigInt(bin.reserveY.toString()),
        }),
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
        source: z.enum(['pool', 'reference', 'combined']).default('combined'),
      })
      .safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: params.data.pool, canonical: true },
      select: { id: true, tokenX: true, tokenY: true, quoteToken: true, tokenXDecimals: true, tokenYDecimals: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    const poolCandles = await prisma.candle.findMany({
      where: { poolId: pool.id, interval: query.data.interval },
      orderBy: { bucketStart: 'desc' },
      take: query.data.limit,
    });
    const referenceCandles = query.data.source === 'pool' ? [] : await prisma.referenceCandle.findMany({
      where: { poolId: pool.id, interval: query.data.interval },
      orderBy: { bucketStart: 'desc' },
      take: query.data.limit,
    });
    if (query.data.source === 'reference' || (query.data.source === 'combined' && referenceCandles.length > 0)) {
      const serialized: SerializedCandle[] = referenceCandles.reverse().map(candle => ({
        timestamp: candle.bucketStart.toISOString(),
        open: candle.open.toString(), high: candle.high.toString(), low: candle.low.toString(), close: candle.close.toString(),
        volumeX: '0', volumeY: '0', volumeQuote: null, swapCount: 0, synthetic: false,
        source: 'reference', sourceUpdatedAt: candle.sourceUpdatedAt.toISOString(), stale: candle.stale,
      }));
      return { data: fillCandleGaps(serialized, query.data.interval, query.data.limit) };
    }
    const serialized: SerializedCandle[] = poolCandles.reverse().map(candle => {
      const quoteIsX = pool.quoteToken?.toLowerCase() === pool.tokenX.toLowerCase();
      const quoteIsY = pool.quoteToken?.toLowerCase() === pool.tokenY.toLowerCase();
      const quoteDecimals = quoteIsX ? pool.tokenXDecimals : quoteIsY ? pool.tokenYDecimals : null;
      const quoteRaw = quoteIsX ? candle.volumeX : quoteIsY ? candle.volumeY : null;
      return {
        timestamp: candle.bucketStart.toISOString(),
        open: candle.open.toString(),
        high: candle.high.toString(),
        low: candle.low.toString(),
        close: candle.close.toString(),
        volumeX: candle.volumeX.toString(),
        volumeY: candle.volumeY.toString(),
        volumeQuote: quoteRaw !== null && quoteDecimals !== null
          ? rawUnitsToDecimal(BigInt(quoteRaw.toString()), quoteDecimals, 18)
          : null,
        swapCount: candle.swapCount,
        synthetic: false,
        source: 'pool',
      };
    });
    return { data: serialized };
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
