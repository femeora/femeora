'use client';

import { ApiFeedRailSchema, ApiPoolAssetListSchema } from '@fomeora/types';
import Link from 'next/link';
import { useMemo } from 'react';

import { TokenPair } from '@/components/ui/TokenPair';
import { useApiResource } from '@/lib/api/useApiResource';
import { cn } from '@/lib/cn';

const decimal = (value: string, digits = 2) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
};

/** Desktop right rail: pools by callout count and the day's top callers. */
export function FeedRail() {
  const { data, error, isLoading, mutate } = useApiResource('/v1/feed/rail', ApiFeedRailSchema);
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const assetsByAddress = useMemo(
    () => new Map((assets.data?.data ?? []).map(asset => [asset.address.toLowerCase(), asset])),
    [assets.data],
  );
  const trendingPools = data?.trendingPools ?? [];
  const topCallers = data?.topCallers ?? [];
  return (
    <aside aria-label="Trending" className="hidden flex-col gap-8 py-6 pr-gutter xl:flex">
      <section>
        <h2 className="t-label mb-3 text-muted">Trending by callouts</h2>
        <ol className="glass rounded-[2px] px-4">
          {isLoading ? <li className="py-4 text-sm text-muted">Loading pools…</li> : null}
          {!isLoading && !error && trendingPools.length === 0 ? <li className="py-5"><p className="text-sm">No trending pools yet</p><p className="mt-1 text-xs leading-relaxed text-muted">The first confirmed callout starts this 24h ranking.</p></li> : null}
          {trendingPools.map((pool, index) => {
            const tokenX = assetsByAddress.get(pool.tokenX.toLowerCase());
            const tokenYAddress = pool.quoteToken ?? pool.tokenY;
            const tokenY = assetsByAddress.get(tokenYAddress.toLowerCase());
            return (
            <li key={pool.address} className="border-b border-line last:border-b-0">
              <Link
                href={`/p/${pool.chainId}/${pool.address}`}
                className="flex min-h-12 items-center gap-3 transition-colors hover:text-signal"
              >
                <span className="t-label w-5 text-faint">{index + 1}</span>
                <span className="min-w-0 flex-1"><TokenPair
                  tokenX={pool.tokenX}
                  tokenY={tokenYAddress}
                  tokenXIdentity={tokenX ? { symbol: tokenX.symbol, name: tokenX.name, logoUrl: tokenX.logoUrl } : undefined}
                  tokenYIdentity={tokenY ? { symbol: tokenY.symbol, name: tokenY.name, logoUrl: tokenY.logoUrl } : undefined}
                  compact
                /></span>
                <span className="t-label text-muted">{pool.callouts24h}</span>
                <span
                  className={cn(
                    't-label w-14 text-right',
                    (pool.change24h ?? 0) < 0 ? 'text-down' : 'text-up'
                  )}
                >
                  {pool.change24h === null ? '—' : `${pool.change24h >= 0 ? '+' : ''}${pool.change24h.toFixed(1)}%`}
                </span>
              </Link>
            </li>
          );})}
        </ol>
      </section>

      <section>
        <h2 className="t-label mb-3 text-muted">Top callers 24h</h2>
        <ol className="glass rounded-[2px] px-4">
          {isLoading ? <li className="py-4 text-sm text-muted">Loading callers…</li> : null}
          {!isLoading && !error && topCallers.length === 0 ? <li className="py-5"><p className="text-sm">No ranked callers yet</p><p className="mt-1 text-xs leading-relaxed text-muted">Scores appear after canonical callout activity is indexed.</p></li> : null}
          {topCallers.map((caller, index) => (
            <li
              key={caller.handle}
              className="flex min-h-12 items-center gap-3 border-b border-line last:border-b-0"
            >
              <span className="t-label w-5 text-faint">{index + 1}</span>
              <span className="flex-1">@{caller.handle.replace(/^@/, '')}</span>
              <span className="t-label text-up">+{decimal(caller.earnedQuote, 4)}</span>
              <span className="t-label w-10 text-right text-muted">{decimal(caller.avgInRange, 0)}%</span>
            </li>
          ))}
        </ol>
        <Link
          href="/leaderboard"
          className="t-label mt-3 inline-flex min-h-11 items-center gap-1.5 hover:text-signal"
        >
          Full leaderboard
        </Link>
      </section>

      {error ? <div role="alert" className="t-label text-down">Rail unavailable. <button type="button" onClick={() => void mutate()} className="underline underline-offset-4">Retry</button></div> : null}

      <p className="t-label text-faint">
        Tailing copies a range, not a result. LP positions can lose value.
      </p>
    </aside>
  );
}
