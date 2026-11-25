import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { apiCalloutToCallout } from '@/features/callouts/model/fromApi';
import { PoolTerminal } from '@/features/pool/components/PoolTerminal';
import {
  apiBinsToLiquidity,
  apiCandlesToChart,
  apiPoolToPool,
  activeBinPrice,
  type LivePoolStats,
} from '@/features/pool/model/live';
import {
  FomeoraApiError,
  getPool,
  getPoolBins,
  getPoolCandles,
  getPoolCallouts,
  getPoolLps,
  getPoolStats,
  getPoolTrades,
} from '@/lib/api/server';
import type { ApiPoolDetail } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pool terminal · Femeora',
  description: 'Inspect a canonical pool, its candles, liquidity, trades and LP positions.',
};

// Keep enough reference-market history to show a meaningful shape without
// squeezing hundreds of sub-pixel bars into every interval.
const candleLimits = { '5m': 288, '15m': 240, '1h': 336, '4h': 180 } as const;

interface PageProps { params: { chain: string; pool: string } }

async function optional<T>(request: Promise<T>, fallback: T): Promise<T> {
  try {
    return await request;
  } catch {
    return fallback;
  }
}

function createRequestLimiter(maxConcurrent: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = () => new Promise<void>(resolve => {
    if (active < maxConcurrent) {
      active += 1;
      resolve();
      return;
    }
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <T,>(request: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await request();
    } finally {
      release();
    }
  };
}

function Unavailable() {
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center px-gutter py-16">
      <p className="t-label text-signal">Pool data unavailable</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">The terminal could not be loaded.</h1>
      <p className="mt-3 max-w-xl text-muted">
        Femeora does not substitute simulated prices or trades. Retry after the API and indexer are healthy.
      </p>
      <Link href="/pools" className="t-label mt-5 min-h-11 w-fit text-signal underline underline-offset-4">Back to pools</Link>
    </section>
  );
}

export default async function PoolPage({ params }: PageProps) {
  let detail: ApiPoolDetail;
  try {
    detail = await getPool(params.pool);
  } catch (error) {
    if (error instanceof FomeoraApiError && error.status === 404) notFound();
    return <Unavailable />;
  }
  if (String(detail.chainId) !== params.chain) notFound();

  const activeBin = detail.activeBin ?? 0;
  const from = Math.max(-10_000, activeBin - 40);
  const to = Math.min(10_000, activeBin + 40);
  const emptyList: { data: never[] } = { data: [] };
  const fallbackStats: LivePoolStats = {
    swapCount: detail.counts.swaps,
    openPositions: 0,
    amountIn: '0',
    amountOut: '0',
    totalFee: '0',
    protocolFee: '0',
    reserveX: detail.reserveX,
    reserveY: detail.reserveY,
    reserveUpdatedBlock: detail.reserveUpdatedBlock,
    reserveUtilizationBps: null,
    reserveCapStatus: 'unavailable',
    change24hPct: null,
    tvlQuote: null,
    volume24hQuote: null,
    fee24hQuote: null,
    createdAt: null,
    counts: detail.counts,
  };
  // A pool page needs several independent read models. Keep its fan-out below
  // the API's small production database pool so the first navigation does not
  // turn queued reads into empty fallbacks.
  const limited = createRequestLimiter(4);
  const [stats, pool5m, pool15m, pool1h, pool4h, reference5m, reference15m, reference1h, reference4h, bins, trades, lps, callouts] = await Promise.all([
    optional(limited(() => getPoolStats(detail.address)), fallbackStats),
    optional(limited(() => getPoolCandles(detail.address, '5m', candleLimits['5m'], 'pool')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '15m', candleLimits['15m'], 'pool')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '1h', candleLimits['1h'], 'pool')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '4h', candleLimits['4h'], 'pool')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '5m', candleLimits['5m'], 'reference')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '15m', candleLimits['15m'], 'reference')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '1h', candleLimits['1h'], 'reference')), emptyList),
    optional(limited(() => getPoolCandles(detail.address, '4h', candleLimits['4h'], 'reference')), emptyList),
    detail.type === 'DLMM' ? optional(limited(() => getPoolBins(detail.address, from, to)), emptyList) : emptyList,
    optional(limited(() => getPoolTrades(detail.address)), emptyList),
    optional(limited(() => getPoolLps(detail.address)), emptyList),
    optional(limited(() => getPoolCallouts(detail.address)), emptyList),
  ]);
  const latest = reference15m.data.at(-1) ?? pool15m.data.at(-1) ?? reference1h.data.at(-1) ?? pool1h.data.at(-1);
  const pool = apiPoolToPool(detail, latest, stats);
  const liveStats: LivePoolStats = { ...stats, counts: detail.counts };
  const latestReference = reference15m.data.at(-1) ?? reference1h.data.at(-1);
  const indexedPoolPrice = pool15m.data.at(-1)?.close ?? pool1h.data.at(-1)?.close;
  const poolPrice = activeBinPrice(detail) || Number(indexedPoolPrice ?? 0);
  // A delayed external candle is still the independent reference used to
  // assess the pool's immutable initial price. Its timestamp is shown in the
  // notice, so do not hide the warning merely because the market is delayed.
  const referencePrice = latestReference ? Number(latestReference.close) : 0;
  const priceDeviationPct = poolPrice > 0 && referencePrice > 0
    ? Math.abs(poolPrice / referencePrice - 1) * 100
    : 0;
  const priceWarning = priceDeviationPct > 10 && latestReference
    ? {
        poolPrice,
        referencePrice,
        deviationPct: priceDeviationPct,
        source: latestReference.sourceType === 'GECKOTERMINAL' ? 'GeckoTerminal external market' : 'Chainlink reference market',
        updatedAt: latestReference.timestamp,
      }
    : null;
  return (
    <PoolTerminal
      pool={pool}
      stats={liveStats}
      priceWarning={priceWarning}
      candlesBySource={{
        pool: {
          '5m': apiCandlesToChart(pool5m.data), '15m': apiCandlesToChart(pool15m.data),
          '1h': apiCandlesToChart(pool1h.data), '4h': apiCandlesToChart(pool4h.data),
        },
        reference: {
          '5m': apiCandlesToChart(reference5m.data), '15m': apiCandlesToChart(reference15m.data),
          '1h': apiCandlesToChart(reference1h.data), '4h': apiCandlesToChart(reference4h.data),
        },
      }}
      liquidity={apiBinsToLiquidity(bins.data, activeBin)}
      trades={trades.data}
      lps={lps.data}
      callouts={callouts.data.map(callout => apiCalloutToCallout(callout, detail, reference15m.data.length > 0 ? reference15m.data : pool15m.data))}
    />
  );
}
