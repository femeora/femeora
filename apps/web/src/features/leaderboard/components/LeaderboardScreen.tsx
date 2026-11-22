'use client';

import { useState } from 'react';

import { BadgeCheck } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { formatCompactUsd } from '@/features/pool/model/format';
import { cn } from '@/lib/cn';

import {
  leaderboard,
  SORTS,
  WINDOWS,
  type LeaderboardSort,
  type LeaderboardWindow,
} from '../model/leaderboard';

const cell = 'border-t border-line py-3 pr-4 align-middle last:pr-0';

/** Leaderboard (brief 7.3, Phase 4): windows, sort, and the anti-shill column. */
export function LeaderboardScreen() {
  const [period, setPeriod] = useState<LeaderboardWindow>('24h');
  const [sort, setSort] = useState<LeaderboardSort>('score');
  const rows = leaderboard(period, sort);

  return (
    <div className="mx-auto max-w-[64rem] px-gutter py-8">
      <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="t-label text-muted">Callers</p>
          <h1 className="mt-1 text-h2 font-medium">Leaderboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl label="Window" options={WINDOWS} value={period} onChange={setPeriod} />
          <SegmentedControl label="Sort by" options={SORTS} value={sort} onChange={setSort} />
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <caption className="sr-only">
            Callers ranked by {SORTS.find(option => option.value === sort)?.label}
          </caption>
          <thead>
            <tr className="t-label text-faint">
              {[
                '#',
                'Caller',
                'Callouts',
                'Earned',
                'Tailers',
                'In range',
                'Quick exits',
                'Score',
              ].map(head => (
                <th key={head} scope="col" className="py-3 pr-4 font-normal">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-[0.8125rem] tabular-nums">
            {rows.map((row, index) => (
              <tr key={row.handle} className={cn(row.quickExits > 2 && 'text-muted')}>
                <td className={cn(cell, 't-label', index < 3 ? 'text-signal' : 'text-faint')}>
                  {index + 1}
                </td>
                <td className={cell}>
                  <span className="flex items-center gap-2 font-sans text-[0.9375rem]">
                    <span
                      aria-hidden="true"
                      className="grid size-7 place-items-center rounded-full bg-fg/10 font-mono text-[0.625rem]"
                    >
                      {row.initials}
                    </span>
                    {row.handle}
                    {row.verified ? (
                      <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
                    ) : null}
                  </span>
                </td>
                <td className={cell}>{row.callouts}</td>
                <td className={cn(cell, 'text-up')}>+{formatCompactUsd(row.earnedUsd)}</td>
                <td className={cell}>{row.tailers}</td>
                <td className={cell}>{row.inRangePct}%</td>
                <td className={cn(cell, row.quickExits > 0 && 'text-down')}>{row.quickExits}</td>
                <td className={cell}>{row.score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="t-label mt-6 max-w-[60em] text-muted">
        Score combines fee yield, in-range ratio and social proof. Callouts with a quick exit (50%
        or more removed within 30 min of posting) score zero.
      </p>
    </div>
  );
}
