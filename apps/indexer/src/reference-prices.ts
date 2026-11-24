import { prisma } from '@fomeora/database';
import { rawUnitsToDecimal } from '@fomeora/sdk';
import type { Address } from 'viem';

import type { IndexerClient } from './chain-client.js';

const aggregatorV3Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [],
    outputs: [
      { type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' },
    ],
  },
] as const;

const INTERVALS = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
} as const;

function power10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

export function pairPriceX18(
  baseAnswer: bigint,
  baseDecimals: number,
  quoteAnswer: bigint,
  quoteDecimals: number,
): bigint {
  if (baseAnswer <= 0n || quoteAnswer <= 0n) throw new Error('REFERENCE_PRICE_INVALID');
  return baseAnswer * power10(quoteDecimals + 18) / (quoteAnswer * power10(baseDecimals));
}

function bucket(timestamp: Date, milliseconds: number): Date {
  return new Date(Math.floor(timestamp.getTime() / milliseconds) * milliseconds);
}

export async function refreshReferenceCandles(
  client: IndexerClient,
  chainId: number,
  safeBlock: bigint,
  now = new Date(),
): Promise<{ pools: number; candles: number }> {
  const sources = await prisma.assetPriceSource.findMany({
    where: { chainId, enabled: true, sourceType: 'CHAINLINK', feedAddress: { not: null } },
    orderBy: { priority: 'asc' },
  });
  const sourceByToken = new Map(sources.map(source => [source.tokenAddress, source]));
  const pools = await prisma.pool.findMany({
    where: {
      chainId,
      canonical: true,
      tokenX: { in: [...sourceByToken.keys()] },
      tokenY: { in: [...sourceByToken.keys()] },
      quoteToken: { not: null },
    },
    select: { id: true, address: true, tokenX: true, tokenY: true, quoteToken: true },
  });
  const feedValues = new Map<string, { answer: bigint; decimals: number; updatedAt: Date; stale: boolean }>();
  await Promise.all(sources.map(async source => {
    if (!source.feedAddress) return;
    const [decimals, round] = await Promise.all([
      client.readContract({ address: source.feedAddress as Address, abi: aggregatorV3Abi, functionName: 'decimals', blockNumber: safeBlock }),
      client.readContract({ address: source.feedAddress as Address, abi: aggregatorV3Abi, functionName: 'latestRoundData', blockNumber: safeBlock }),
    ]);
    if (round[1] <= 0n || round[3] === 0n) return;
    const updatedAt = new Date(Number(round[3]) * 1_000);
    feedValues.set(source.tokenAddress, {
      answer: round[1],
      decimals,
      updatedAt,
      stale: now.getTime() - updatedAt.getTime() > source.heartbeatSeconds * 2_000,
    });
  }));

  let candles = 0;
  for (const pool of pools) {
    const x = feedValues.get(pool.tokenX);
    const y = feedValues.get(pool.tokenY);
    if (!x || !y) continue;
    const quoteIsY = pool.quoteToken?.toLowerCase() === pool.tokenY;
    const priceX18 = quoteIsY
      ? pairPriceX18(x.answer, x.decimals, y.answer, y.decimals)
      : pairPriceX18(y.answer, y.decimals, x.answer, x.decimals);
    const price = rawUnitsToDecimal(priceX18, 18, 18);
    const sourceUpdatedAt = x.updatedAt < y.updatedAt ? x.updatedAt : y.updatedAt;
    for (const [interval, milliseconds] of Object.entries(INTERVALS)) {
      const bucketStart = bucket(now, milliseconds);
      const existing = await prisma.referenceCandle.findUnique({
        where: { poolId_interval_bucketStart: { poolId: pool.id, interval, bucketStart } },
      });
      await prisma.referenceCandle.upsert({
        where: { poolId_interval_bucketStart: { poolId: pool.id, interval, bucketStart } },
        create: {
          poolId: pool.id, interval, bucketStart, open: price, high: price, low: price, close: price,
          sourceType: 'CHAINLINK', sourceUpdatedAt, stale: x.stale || y.stale,
        },
        update: {
          high: existing && existing.high.greaterThan(price) ? existing.high : price,
          low: existing && existing.low.lessThan(price) ? existing.low : price,
          close: price, sourceUpdatedAt, stale: x.stale || y.stale,
        },
      });
      if (interval === '1m') {
        const dedupKey = `${chainId}:${pool.id}:pool.reference:${bucketStart.toISOString()}`;
        await prisma.outboxEvent.upsert({
          where: { dedupKey },
          create: {
            dedupKey, topic: 'pool.reference', aggregateId: pool.address, chainId, blockNumber: safeBlock,
            payload: { pool: pool.address, price, source: 'CHAINLINK', sourceUpdatedAt: sourceUpdatedAt.toISOString(), stale: x.stale || y.stale },
          },
          update: {
            blockNumber: safeBlock,
            payload: { pool: pool.address, price, source: 'CHAINLINK', sourceUpdatedAt: sourceUpdatedAt.toISOString(), stale: x.stale || y.stale },
            canonical: true,
          },
        });
      }
      candles += 1;
    }
  }
  return { pools: pools.length, candles };
}
