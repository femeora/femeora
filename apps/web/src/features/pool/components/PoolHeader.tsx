import { ChainBadge } from '@/components/ui/ChainBadge';
import { TriangleAlert } from '@/components/ui/icons';
import { StatusDot } from '@/components/ui/StatusDot';
import { TokenIcon } from '@/components/ui/TokenPair';
import { cn } from '@/lib/cn';
import { tokenMeta } from '@/lib/tokens';

import { formatPct, formatUnit, formatUsdMetric, toUnit } from '../model/format';
import type { Pool } from '../model/pool';

interface Stat {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}

export interface PoolPriceWarning {
  poolPrice: number;
  referencePrice: number;
  deviationPct: number;
  source: string;
  updatedAt: string;
}

function PoolPriceNotice({
  warning,
  onViewReference,
}: {
  warning: PoolPriceWarning;
  onViewReference: () => void;
}) {
  const summary = `Initial pool price is ${warning.deviationPct.toFixed(2)}% away from the independent market reference`;
  return (
    <details className="group relative inline-flex">
      <summary
        className="grid size-6 cursor-pointer list-none place-items-center text-down outline-none transition-opacity hover:opacity-75 focus-visible:ring-1 focus-visible:ring-down [&::-webkit-details-marker]:hidden"
        aria-label={summary}
        title={summary}
      >
        <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={1.8} />
      </summary>
      <div className="invisible absolute left-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[calc(100vw-3rem)] translate-y-1 border border-down/60 bg-panel-1 p-3 opacity-0 shadow-2xl transition-[opacity,transform,visibility] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-open:visible group-open:translate-y-0 group-open:opacity-100">
        <p className="t-label text-down">Initial pool price warning</p>
        <p className="mt-1 text-xs normal-case tracking-normal text-fg">{summary}.</p>
        <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
          Pool {warning.poolPrice.toPrecision(8)} · Reference{' '}
          {warning.referencePrice.toPrecision(8)}
          <br />
          {warning.source} · {new Date(warning.updatedAt).toLocaleString()}
        </p>
        <button
          type="button"
          className="mt-3 min-h-9 w-full border border-line-strong bg-panel-2 px-3 text-[0.625rem] uppercase tracking-[0.12em] text-fg hover:border-fg"
          onClick={onViewReference}
        >
          View reference chart
        </button>
      </div>
    </details>
  );
}

function poolStats(pool: Pool): Stat[] {
  const available = (value: number | null, formatter: (number: number) => string) =>
    value === null ? '—' : formatter(value);
  return [
    {
      label: 'MCap',
      value: pool.marketCapAvailable
        ? formatUnit(toUnit(pool.priceUsd, 'mcap', pool), 'mcap')
        : '—',
    },
    { label: 'Price', value: formatUnit(pool.priceUsd, 'price') },
    {
      label: '24h',
      value: available(pool.change24hPct, formatPct),
      ...(pool.change24hPct === null
        ? {}
        : { tone: pool.change24hPct >= 0 ? ('up' as const) : ('down' as const) }),
    },
    { label: 'TVL', value: available(pool.tvlUsd, formatUsdMetric) },
    { label: '24h Vol', value: available(pool.volume24hUsd, formatUsdMetric) },
    { label: '24h Fee', value: available(pool.fee24hUsd, formatUsdMetric) },
    {
      label: 'Fees / TVL',
      value:
        pool.fee24hUsd === null || pool.tvlUsd === null || pool.tvlUsd === 0
          ? '—'
          : formatPct((pool.fee24hUsd / pool.tvlUsd) * 100, 2),
    },
    { label: 'Pool age', value: pool.age ?? '—' },
  ];
}

/** Pool identity and headline stats (brief 8.1 header). */
export function PoolHeader({
  pool,
  priceWarning,
  onViewReference,
}: {
  pool: Pool;
  priceWarning: PoolPriceWarning | null;
  onViewReference: () => void;
}) {
  const base = tokenMeta(pool.baseAddress);
  const quote = tokenMeta(pool.quoteAddress);
  const baseName = pool.baseName ?? base.name;
  const quoteName = pool.quoteName ?? quote.name;
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0 items-center pl-1">
          <TokenIcon
            token={pool.baseAddress}
            logoUrl={pool.baseLogoUrl}
            name={baseName}
            className="z-10 size-11"
          />
          <TokenIcon
            token={pool.quoteAddress}
            logoUrl={pool.quoteLogoUrl}
            name={quoteName}
            className="-ml-3 size-11"
          />
        </span>
        <div>
          <h1 className="text-2xl font-medium tracking-tight">
            {pool.base} <span className="text-muted">/ {pool.quote}</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {baseName} · {quoteName}
          </p>
          <p className="t-label mt-0.5 flex flex-wrap items-center gap-x-2 text-muted">
            <span className="rounded-[2px] border border-line-strong px-1.5 text-fg">
              {pool.type}
            </span>
            <span>Bin step {pool.binStepBps / 100}%</span>·
            <span>Base fee {pool.baseFeeBps / 100}%</span>·
            {priceWarning ? (
              <PoolPriceNotice warning={priceWarning} onViewReference={onViewReference} />
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <StatusDot tone="up" />
                <ChainBadge />
              </span>
            )}
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
