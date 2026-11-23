import type { Prisma } from '@fomeora/database';
import { rawUnitsToDecimal } from '@fomeora/sdk';

export const CANDLE_INTERVAL_SECONDS = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3_600,
  '4h': 14_400,
  '1d': 86_400,
} as const;

export type CandleInterval = keyof typeof CANDLE_INTERVAL_SECONDS;

export interface CandleSwap {
  readonly timestamp: Date;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly tokenIn: string;
  readonly amountIn: string;
  readonly amountOut: string;
}

export interface CandlePool {
  readonly tokenX: string;
  readonly tokenY: string;
  readonly tokenXDecimals: number | null;
  readonly tokenYDecimals: number | null;
}

export interface ProjectedCandle {
  readonly interval: CandleInterval;
  readonly bucketStart: Date;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volumeX: string;
  readonly volumeY: string;
  readonly swapCount: number;
}

function bucketStart(timestamp: Date, interval: CandleInterval): Date {
  const milliseconds = CANDLE_INTERVAL_SECONDS[interval] * 1_000;
  return new Date(Math.floor(timestamp.getTime() / milliseconds) * milliseconds);
}

function compareSwaps(left: CandleSwap, right: CandleSwap): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex - right.transactionIndex;
  }
  return left.logIndex - right.logIndex;
}

function execution(swap: CandleSwap, pool: CandlePool) {
  if (pool.tokenXDecimals === null || pool.tokenYDecimals === null) return null;
  const amountIn = BigInt(swap.amountIn);
  const amountOut = BigInt(swap.amountOut);
  if (amountIn <= 0n || amountOut <= 0n) return null;
  const tokenIn = swap.tokenIn.toLowerCase();
  const tokenX = pool.tokenX.toLowerCase();
  const tokenY = pool.tokenY.toLowerCase();
  const amountX = tokenIn === tokenX ? amountIn : tokenIn === tokenY ? amountOut : null;
  const amountY = tokenIn === tokenY ? amountIn : tokenIn === tokenX ? amountOut : null;
  if (amountX === null || amountY === null) return null;
  const numerator = amountY * 10n ** BigInt(pool.tokenXDecimals) * 10n ** 18n;
  const denominator = amountX * 10n ** BigInt(pool.tokenYDecimals);
  const priceX18 = numerator / denominator;
  if (priceX18 === 0n) return null;
  return {
    price: rawUnitsToDecimal(priceX18, 18, 18),
    priceX18,
    amountX,
    amountY,
  };
}

export function candleBucketKey(interval: CandleInterval, timestamp: Date): string {
  return `${interval}:${bucketStart(timestamp, interval).toISOString()}`;
}

export function projectCandles(
  swaps: readonly CandleSwap[],
  pool: CandlePool,
): readonly ProjectedCandle[] {
  const candles = new Map<string, {
    interval: CandleInterval;
    bucketStart: Date;
    open: string;
    high: string;
    highX18: bigint;
    low: string;
    lowX18: bigint;
    close: string;
    volumeX: bigint;
    volumeY: bigint;
    swapCount: number;
  }>();
  for (const swap of [...swaps].sort(compareSwaps)) {
    const value = execution(swap, pool);
    if (!value) continue;
    for (const interval of Object.keys(CANDLE_INTERVAL_SECONDS) as CandleInterval[]) {
      const start = bucketStart(swap.timestamp, interval);
      const key = `${interval}:${start.toISOString()}`;
      const current = candles.get(key);
      if (!current) {
        candles.set(key, {
          interval,
          bucketStart: start,
          open: value.price,
          high: value.price,
          highX18: value.priceX18,
          low: value.price,
          lowX18: value.priceX18,
          close: value.price,
          volumeX: value.amountX,
          volumeY: value.amountY,
          swapCount: 1,
        });
        continue;
      }
      if (value.priceX18 > current.highX18) {
        current.high = value.price;
        current.highX18 = value.priceX18;
      }
      if (value.priceX18 < current.lowX18) {
        current.low = value.price;
        current.lowX18 = value.priceX18;
      }
      current.close = value.price;
      current.volumeX += value.amountX;
      current.volumeY += value.amountY;
      current.swapCount += 1;
    }
  }
  return [...candles.values()].map(({ highX18: _high, lowX18: _low, ...candle }) => ({
    ...candle,
    volumeX: candle.volumeX.toString(),
    volumeY: candle.volumeY.toString(),
  }));
}

export async function rebuildTouchedCandles(
  transaction: Prisma.TransactionClient,
  poolId: string,
  timestamps: readonly Date[],
): Promise<number> {
  if (timestamps.length === 0) return 0;
  const targets = new Map<string, { interval: CandleInterval; bucketStart: Date }>();
  for (const timestamp of timestamps) {
    for (const interval of Object.keys(CANDLE_INTERVAL_SECONDS) as CandleInterval[]) {
      const start = bucketStart(timestamp, interval);
      targets.set(`${interval}:${start.toISOString()}`, { interval, bucketStart: start });
    }
  }
  const starts = [...targets.values()].map(target => target.bucketStart.getTime());
  const from = new Date(Math.min(...starts));
  const to = new Date(Math.max(...starts) + CANDLE_INTERVAL_SECONDS['1d'] * 1_000);
  const pool = await transaction.pool.findFirst({
    where: { id: poolId, canonical: true },
    select: {
      tokenX: true,
      tokenY: true,
      tokenXDecimals: true,
      tokenYDecimals: true,
    },
  });
  const swaps = pool
    ? await transaction.swap.findMany({
        where: { poolId, canonical: true, timestamp: { gte: from, lt: to } },
        select: {
          timestamp: true,
          blockNumber: true,
          transactionIndex: true,
          logIndex: true,
          tokenIn: true,
          amountIn: true,
          amountOut: true,
        },
      })
    : [];
  const projected = pool
    ? projectCandles(swaps.map(swap => ({
        ...swap,
        amountIn: swap.amountIn.toString(),
        amountOut: swap.amountOut.toString(),
      })), pool).filter(candle => targets.has(`${candle.interval}:${candle.bucketStart.toISOString()}`))
    : [];
  await transaction.candle.deleteMany({
    where: {
      poolId,
      OR: [...targets.values()].map(target => ({
        interval: target.interval,
        bucketStart: target.bucketStart,
      })),
    },
  });
  if (projected.length > 0) {
    await transaction.candle.createMany({
      data: projected.map(candle => ({ poolId, ...candle })),
    });
  }
  return projected.length;
}
