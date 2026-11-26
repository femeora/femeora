'use client';

import {
  ApiLaunchpadReputationLeaderboardSchema,
  ApiLeaderboardSchema,
  type ApiLaunchpadReputationLeaderboard,
} from '@fomeora/types';
import Link from 'next/link';
import { useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck, Trophy } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useApiResource } from '@/lib/api/useApiResource';
import { cn } from '@/lib/cn';

import { SORTS, WINDOWS, type LeaderboardSort, type LeaderboardWindow } from '../model/leaderboard';

const cell = 'border-t border-line py-3 pr-4 align-middle last:pr-0';
const decimal = (value: string, digits = 2) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';
};

/** Leaderboard (brief 7.3, Phase 4): windows, sort, and the anti-shill column. */
export function LeaderboardScreen() {
  const [board, setBoard] = useState<'callers' | 'launchpads'>('callers');
  const [period, setPeriod] = useState<LeaderboardWindow>('7d');
  const [sort, setSort] = useState<LeaderboardSort>('score');
  const [launchpadWindow, setLaunchpadWindow] = useState<'7d' | 'all'>('7d');
  const [launchpadSort, setLaunchpadSort] = useState<'score' | 'revenue' | 'graduationRate'>(
    'score'
  );
  const path = `/v1/leaderboard?window=${period}&sort=${sort}&limit=100`;
  const { data, error, isLoading, mutate } = useApiResource(
    board === 'callers' ? path : null,
    ApiLeaderboardSchema
  );
  const launchpadResource = useApiResource(
    board === 'launchpads'
      ? `/v1/launchpads/leaderboard?window=${launchpadWindow}&sort=${launchpadSort}&limit=100`
      : null,
    ApiLaunchpadReputationLeaderboardSchema
  );
  const rows = data?.data ?? [];

  return (
    <div className="mx-auto max-w-[64rem] px-gutter py-8">
      <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="t-label text-signal">Historical canonical activity · no promised value</p>
          <h1 className="mt-1 text-h2 font-medium">Femeora leaderboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            label="Leaderboard"
            options={[
              { value: 'callers', label: 'Callers' },
              { value: 'launchpads', label: 'Launchpads' },
            ]}
            value={board}
            onChange={setBoard}
          />
          {board === 'callers' ? (
            <>
              <SegmentedControl
                label="Window"
                options={WINDOWS}
                value={period}
                onChange={setPeriod}
              />
              <SegmentedControl label="Sort by" options={SORTS} value={sort} onChange={setSort} />
            </>
          ) : (
            <>
              <SegmentedControl
                label="Window"
                options={[
                  { value: '7d', label: '7d' },
                  { value: 'all', label: 'All' },
                ]}
                value={launchpadWindow}
                onChange={setLaunchpadWindow}
              />
              <SegmentedControl
                label="Sort by"
                options={[
                  { value: 'score', label: 'Score' },
                  { value: 'revenue', label: 'Revenue' },
                  { value: 'graduationRate', label: 'Graduation' },
                ]}
                value={launchpadSort}
                onChange={setLaunchpadSort}
              />
            </>
          )}
        </div>
      </header>

      <div className="glass mt-6 overflow-x-auto rounded-[2px] px-4">
        {board === 'launchpads' ? (
          <LaunchpadLeaderboard
            data={launchpadResource.data}
            error={launchpadResource.error}
            isLoading={launchpadResource.isLoading}
            onRetry={() => void launchpadResource.mutate()}
          />
        ) : null}
        {board === 'callers' ? (
          <>
            {isLoading ? (
              <p className="py-14 text-center text-muted">Loading canonical rankings…</p>
            ) : null}
            {error ? (
              <div role="alert" className="py-14 text-center">
                <p className="text-down">Leaderboard unavailable.</p>
                <button
                  type="button"
                  onClick={() => void mutate()}
                  className="mt-3 min-h-11 text-signal underline underline-offset-4"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {!isLoading && !error && rows.length === 0 ? (
              <p className="py-14 text-center text-muted">
                No ranked callers yet. Rankings appear after canonical callouts are indexed.
              </p>
            ) : null}
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
                      <td
                        className={cn(
                          cell,
                          't-label',
                          row.rank <= 3 ? 'text-signal' : 'text-faint'
                        )}
                      >
                        {row.rank}
                      </td>
                      <td className={cell}>
                        <span className="flex items-center gap-2 font-sans text-[0.9375rem]">
                          <Avatar
                            seed={row.handle}
                            src={row.avatarUrl}
                            alt={`${row.name ?? row.handle} X avatar`}
                            size="sm"
                          />
                          {period === '7d' && row.rank <= 3 ? (
                            <Trophy
                              aria-label={`Season rank ${row.rank}`}
                              className="size-4 text-signal"
                            />
                          ) : null}
                          <a
                            href={`/u/${row.handle.replace(/^@/, '')}`}
                            className="hover:text-signal"
                          >
                            @{row.handle.replace(/^@/, '')}
                          </a>
                          {row.xVerified ? (
                            <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
                          ) : null}
                        </span>
                      </td>
                      <td className={cell}>{row.callouts}</td>
                      <td className={cn(cell, 'text-up')}>+{decimal(row.earnedQuote, 6)}</td>
                      <td className={cell}>{row.tailers}</td>
                      <td className={cell}>{decimal(row.avgInRange)}%</td>
                      <td className={cn(cell, row.quickExits > 0 && 'text-down')}>
                        {row.quickExits}
                      </td>
                      <td className={cell}>{decimal(row.score, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        ) : null}
      </div>

      <p className="t-label mt-6 max-w-[60em] text-muted">
        {board === 'callers' ? (
          <>
            Earned values use each pool&apos;s configured quote token. Score combines canonical fee
            yield, in-range ratio and social proof. Quick exits are penalized by the server-side
            rollup.
          </>
        ) : (
          <>
            Launchpad reputation uses canonical launches, trades, graduations, post-graduation
            activity, revenue and protection settings. Historical scores do not predict future
            results.
          </>
        )}
      </p>
    </div>
  );
}

function LaunchpadLeaderboard({
  data,
  error,
  isLoading,
  onRetry,
}: {
  data: ApiLaunchpadReputationLeaderboard | undefined;
  error: Error | undefined;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const rows = data?.data ?? [];
  if (isLoading)
    return <p className="py-14 text-center text-muted">Loading launchpad reputation…</p>;
  if (error)
    return (
      <div role="alert" className="py-14 text-center">
        <p className="text-down">Launchpad reputation unavailable.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 text-signal underline underline-offset-4"
        >
          Retry
        </button>
      </div>
    );
  if (rows.length === 0)
    return (
      <p className="py-14 text-center text-muted">
        Reputation appears after the first canonical rollup.
      </p>
    );
  return (
    <table className="w-full min-w-[48rem] text-left">
      <thead>
        <tr className="t-label text-faint">
          {['#', 'Launchpad', 'Tier', 'Score', 'Launches', 'Graduation', 'Survival', 'Revenue'].map(
            head => (
              <th key={head} className="py-3 pr-4 font-normal">
                {head}
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody className="font-mono text-[0.8125rem] tabular-nums">
        {rows.map((row, index) => (
          <tr key={row.launchpad.id}>
            <td className={cn(cell, 'text-faint')}>{index + 1}</td>
            <td className={cell}>
              <Link
                href={`/lp/${row.launchpad.slug}`}
                className="flex items-center gap-2 font-sans text-[0.9375rem] hover:text-signal"
              >
                <Avatar seed={row.launchpad.slug} src={row.launchpad.logoUrl} alt="" size="sm" />
                {row.launchpad.name}
              </Link>
            </td>
            <td
              className={cn(cell, row.reputation.tier === 'Verified' ? 'text-up' : 'text-signal')}
            >
              {row.reputation.tier === 'Unrated' ? 'New' : row.reputation.tier}
            </td>
            <td className={cell}>
              {row.reputation.tier === 'Unrated' ? '—' : decimal(row.reputation.score)}
            </td>
            <td className={cell}>{row.reputation.launches}</td>
            <td className={cell}>{decimal(row.reputation.graduationRate)}%</td>
            <td className={cell}>{decimal(row.reputation.survivalRate)}%</td>
            <td className={cell}>{decimal(row.reputation.revenueQuote, 6)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
