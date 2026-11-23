import { ChainBadge } from '@/components/ui/ChainBadge';
import { StatusDot } from '@/components/ui/StatusDot';
import { TokenIcon } from '@/components/ui/TokenPair';
import { cn } from '@/lib/cn';
import { tokenMeta } from '@/lib/tokens';

import { formatCompactUsd, formatPct, formatUnit, toUnit } from '../model/format';
import type { Pool } from '../model/pool';

interface Stat {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}

function poolStats(pool: Pool): Stat[] {
  const available = (value: number | null, formatter: (number: number) => string) =>
    value === null ? '—' : formatter(value);
  return [
    {
      label: 'MCap',
      value: pool.marketCapAvailable ? formatUnit(toUnit(pool.priceUsd, 'mcap', pool), 'mcap') : '—',
    },
    { label: 'Price', value: formatUnit(pool.priceUsd, 'price') },
    {
      label: '24h',
      value: available(pool.change24hPct, formatPct),
      ...(pool.change24hPct === null
        ? {}
        : { tone: pool.change24hPct >= 0 ? 'up' as const : 'down' as const }),
    },
    { label: 'TVL', value: available(pool.tvlUsd, formatCompactUsd) },
    { label: '24h Vol', value: available(pool.volume24hUsd, formatCompactUsd) },
    { label: '24h Fee', value: available(pool.fee24hUsd, formatCompactUsd) },
    {
      label: 'Fees / TVL',
      value: pool.fee24hUsd === null || pool.tvlUsd === null || pool.tvlUsd === 0
        ? '—'
        : formatPct((pool.fee24hUsd / pool.tvlUsd) * 100, 2),
    },
    { label: 'Pool age', value: pool.age ?? '—' },
  ];
}

/** Pool identity and headline stats (brief 8.1 header). */
export function PoolHeader({ pool }: { pool: Pool }) {
  const base = tokenMeta(pool.tokenX);
  const quote = tokenMeta(pool.tokenY);
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0 items-center pl-1">
          <TokenIcon token={pool.tokenX} className="size-11" />
          <TokenIcon token={pool.tokenY} className="-ml-3 size-11" />
        </span>
        <div>
          <h1 className="text-2xl font-medium tracking-tight">
            {pool.base} <span className="text-muted">/ {pool.quote}</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">{base.name} · {quote.name}</p>
          <p className="t-label mt-0.5 flex flex-wrap items-center gap-x-2 text-muted">
            <span className="rounded-[2px] border border-line-strong px-1.5 text-fg">
              {pool.type}
            </span>
            <span>Bin step {pool.binStepBps / 100}%</span>·
            <span>Base fee {pool.baseFeeBps / 100}%</span>·
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone="up" />
              <ChainBadge />
            </span>
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-x-6 gap-y-3 sm:grid-cols-8">
        {poolStats(pool).map(stat => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <dt className="t-label text-faint">{stat.label}</dt>
            <dd
              className={cn(
                'whitespace-nowrap font-mono text-sm tabular-nums',
                stat.tone === 'up' && 'text-up',
                stat.tone === 'down' && 'text-down'
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
