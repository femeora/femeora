import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { apiCalloutToCallout } from '@/features/callouts/model/fromApi';
import { PoolTerminal } from '@/features/pool/components/PoolTerminal';
import {
  apiBinsToLiquidity,
  apiCandlesToChart,
  apiPoolToPool,
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

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pool terminal · Fomeora',
  description: 'Inspect a canonical pool, its candles, liquidity, trades and LP positions.',
};

const candleLimits = { '5m': 96, '15m': 80, '1h': 64, '4h': 48 } as const;

interface PageProps { params: { chain: string; pool: string } }

function Unavailable() {
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center px-gutter py-16">
      <p className="t-label text-signal">Pool data unavailable</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">The terminal could not be loaded.</h1>
      <p className="mt-3 max-w-xl text-muted">
        Fomeora does not substitute simulated prices or trades. Retry after the API and indexer are healthy.
      </p>
      <Link href="/pools" className="t-label mt-5 min-h-11 w-fit text-signal underline underline-offset-4">Back to pools</Link>
    </section>
  );
}

export default async function PoolPage({ params }: PageProps) {
  let detail;
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
  try {
    const [stats, candles5m, candles15m, candles1h, candles4h, bins, trades, lps, callouts] = await Promise.all([
      getPoolStats(detail.address),
      getPoolCandles(detail.address, '5m', candleLimits['5m']),
      getPoolCandles(detail.address, '15m', candleLimits['15m']),
      getPoolCandles(detail.address, '1h', candleLimits['1h']),
      getPoolCandles(detail.address, '4h', candleLimits['4h']),
      detail.type === 'DLMM' ? getPoolBins(detail.address, from, to) : Promise.resolve({ data: [] }),
      getPoolTrades(detail.address),
      getPoolLps(detail.address),
      getPoolCallouts(detail.address),
    ]);
    const latest = candles15m.data.at(-1) ?? candles1h.data.at(-1);
    const pool = apiPoolToPool(detail, latest);
    const liveStats: LivePoolStats = { ...stats, counts: detail.counts };
    return (
      <PoolTerminal
        pool={pool}
        stats={liveStats}
        candlesByInterval={{
          '5m': apiCandlesToChart(candles5m.data),
          '15m': apiCandlesToChart(candles15m.data),
          '1h': apiCandlesToChart(candles1h.data),
          '4h': apiCandlesToChart(candles4h.data),
        }}
        liquidity={apiBinsToLiquidity(bins.data, activeBin)}
        trades={trades.data}
        lps={lps.data}
        callouts={callouts.data.map(callout => apiCalloutToCallout(callout, detail, candles15m.data))}
      />
    );
  } catch {
    return <Unavailable />;
  }
}
