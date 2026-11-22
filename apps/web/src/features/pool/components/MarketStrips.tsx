'use client';

import { useState, type ReactNode } from 'react';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

import {
  ACTIVITY_WINDOWS,
  activityByWindow,
  socialStats,
  type ActivityWindow,
} from '../model/activity';
import { formatCompactUsd } from '../model/format';

const windowOptions = ACTIVITY_WINDOWS.map(value => ({ value, label: value }));

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="t-label text-faint">{label}</span>
      <span className="font-mono text-[0.8125rem] tabular-nums">{children}</span>
    </div>
  );
}

/** Activity strip (Vol, Buys, Sells, Net buy) and social strip (brief 8.1). */
export function MarketStrips() {
  const [activeWindow, setActiveWindow] = useState<ActivityWindow>('1h');
  const stats = activityByWindow[activeWindow];
  const netBuy = stats.buysUsd - stats.sellsUsd;

  return (
    <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2">
      <section
        aria-label="Activity"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-bg py-3 sm:pr-4"
      >
        <SegmentedControl
          label="Activity window"
          options={windowOptions}
          value={activeWindow}
          onChange={setActiveWindow}
        />
        <Cell label="Vol">{formatCompactUsd(stats.volumeUsd)}</Cell>
        <Cell label="Buys">
          <span className="text-up">{stats.buys}</span> / {formatCompactUsd(stats.buysUsd)}
        </Cell>
        <Cell label="Sells">
          <span className="text-down">{stats.sells}</span> / {formatCompactUsd(stats.sellsUsd)}
        </Cell>
        <Cell label="Net buy">
          <span className={netBuy >= 0 ? 'text-up' : 'text-down'}>{formatCompactUsd(netBuy)}</span>
        </Cell>
      </section>
      <section
        aria-label="Social"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-bg py-3 sm:pl-4"
      >
        <Cell label="Callouts 24h">{socialStats.callouts24h}</Cell>
        <Cell label="Callers in range">{socialStats.callersInRange}</Cell>
        <Cell label="LP sentiment">{socialStats.buySidePct}% buy-side</Cell>
        <Cell label="Top caller">{socialStats.topCaller}</Cell>
      </section>
    </div>
  );
}
