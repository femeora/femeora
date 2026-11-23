import type { ReactNode } from 'react';

import type { LivePoolStats } from '../model/live';

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="t-label text-faint">{label}</span>
      <span className="font-mono text-[0.8125rem] tabular-nums">{children}</span>
    </div>
  );
}

function raw(value: string): string {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number.toLocaleString('en-US') : value;
}

function capUsage(stats: LivePoolStats): string {
  if (stats.reserveUtilizationBps === null) return 'Pending snapshot';
  const usage = `${(stats.reserveUtilizationBps / 100).toFixed(2)}%`;
  if (stats.reserveCapStatus === 'critical') return `${usage} · critical`;
  if (stats.reserveCapStatus === 'warning') return `${usage} · warning`;
  return usage;
}

/** Canonical all-time pool counters. Windowed USD metrics stay absent until quote valuation exists. */
export function MarketStrips({ stats }: { stats: LivePoolStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section
        aria-label="On-chain activity"
        className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[2px] p-3"
      >
        <Cell label="Canonical swaps">{stats.swapCount}</Cell>
        <Cell label="Token in">{raw(stats.amountIn)}</Cell>
        <Cell label="Token out">{raw(stats.amountOut)}</Cell>
        <Cell label="Protocol fee">{raw(stats.protocolFee)}</Cell>
      </section>
      <section
        aria-label="Pool participation"
        className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[2px] p-3"
      >
        <Cell label="Open positions">{stats.openPositions}</Cell>
        <Cell label="Positions">{stats.counts.positions}</Cell>
        <Cell label="Callouts">{stats.counts.callouts}</Cell>
        <Cell label="Indexed trades">{stats.counts.swaps}</Cell>
        <Cell label="Reserve cap">{capUsage(stats)}</Cell>
      </section>
    </div>
  );
}
