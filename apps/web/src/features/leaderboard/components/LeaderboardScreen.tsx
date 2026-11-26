'use client';

import { ApiLeaderboardSchema } from '@fomeora/types';
import { useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck, Trophy } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useApiResource } from '@/lib/api/useApiResource';
import { cn } from '@/lib/cn';

import {
  SORTS,
  WINDOWS,
  type LeaderboardSort,
  type LeaderboardWindow,
} from '../model/leaderboard';

const cell = 'border-t border-line py-3 pr-4 align-middle last:pr-0';
const decimal = (value: string, digits = 2) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
};

/** Leaderboard (brief 7.3, Phase 4): windows, sort, and the anti-shill column. */
export function LeaderboardScreen() {
  const [period, setPeriod] = useState<LeaderboardWindow>('7d');
  const [sort, setSort] = useState<LeaderboardSort>('score');
  const path = `/v1/leaderboard?window=${period}&sort=${sort}&limit=100`;
  const { data, error, isLoading, mutate } = useApiResource(path, ApiLeaderboardSchema);
  const rows = data?.data ?? [];

  return (
    <div className="mx-auto max-w-[64rem] px-gutter py-8">
      <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="t-label text-signal">Weekly season · points have no promised value</p>
          <h1 className="mt-1 text-h2 font-medium">Caller leaderboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl label="Window" options={WINDOWS} value={period} onChange={setPeriod} />
          <SegmentedControl label="Sort by" options={SORTS} value={sort} onChange={setSort} />
        </div>
      </header>

      <div className="glass mt-6 overflow-x-auto rounded-[2px] px-4">
        {isLoading ? <p className="py-14 text-center text-muted">Loading canonical rankings…</p> : null}
        {error ? <div role="alert" className="py-14 text-center"><p className="text-down">Leaderboard unavailable.</p><button type="button" onClick={() => void mutate()} className="mt-3 min-h-11 text-signal underline underline-offset-4">Retry</button></div> : null}
        {!isLoading && !error && rows.length === 0 ? <p className="py-14 text-center text-muted">No ranked callers yet. Rankings appear after canonical callouts are indexed.</p> : null}
        {!isLoading && !error && rows.length > 0 ? (
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
                period === '7d' ? 'Season points' : 'Score',
              ].map(head => (
                <th key={head} scope="col" className="py-3 pr-4 font-normal">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-[0.8125rem] tabular-nums">
            {rows.map(row => (
              <tr key={row.userId} className={cn(row.quickExits > 2 && 'text-muted')}>
                <td className={cn(cell, 't-label', row.rank <= 3 ? 'text-signal' : 'text-faint')}>
                  {row.rank}
                </td>
                <td className={cell}>
                  <span className="flex items-center gap-2 font-sans text-[0.9375rem]">
                    <Avatar seed={row.handle} src={row.avatarUrl} alt={`${row.name ?? row.handle} X avatar`} size="sm" />
                    {period === '7d' && row.rank <= 3 ? <Trophy aria-label={`Season rank ${row.rank}`} className="size-4 text-signal" /> : null}
                    <a href={`/u/${row.handle.replace(/^@/, '')}`} className="hover:text-signal">@{row.handle.replace(/^@/, '')}</a>
                    {row.xVerified ? (
                      <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
                    ) : null}
                  </span>
                </td>
                <td className={cell}>{row.callouts}</td>
                <td className={cn(cell, 'text-up')}>+{decimal(row.earnedQuote, 6)}</td>
                <td className={cell}>{row.tailers}</td>
                <td className={cell}>{decimal(row.avgInRange)}%</td>
                <td className={cn(cell, row.quickExits > 0 && 'text-down')}>{row.quickExits}</td>
                <td className={cell}>{decimal(row.score, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : null}
      </div>

      <p className="t-label mt-6 max-w-[60em] text-muted">
        Earned values use each pool&apos;s configured quote token. Score combines canonical fee yield,
        in-range ratio and social proof. Quick exits are penalized by the server-side rollup.
      </p>
    </div>
  );
}
