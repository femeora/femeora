'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Tabs } from '@/components/ui/Tabs';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import { useAllCallouts } from '@/features/callouts/useAllCallouts';
import { usePortfolio } from '@/features/portfolio/store';
import { useSession } from '@/features/session/store';
import { cn } from '@/lib/cn';

import { recentTrades, topLps } from '../model/activity';
import { formatCompactUsd, formatTokenAmount } from '../model/format';
import type { Pool } from '../model/pool';

type PoolTab = 'callouts' | 'positions' | 'top-lps' | 'trades';

interface PoolTabsProps {
  pool: Pool;
}

function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left">
        <thead>
          <tr className="t-label text-faint">
            {head.map(cell => (
              <th
                key={cell}
                scope="col"
                className="py-3 pr-4 font-normal last:pr-0 last:text-right"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[0.8125rem] tabular-nums">{children}</tbody>
      </table>
    </div>
  );
}

/** The signed-in user's positions in this pool, or a sign-in prompt. */
function PoolPositions({ pool }: { pool: Pool }) {
  const user = useSession(state => state.user);
  const openSignIn = useSession(state => state.openSignIn);
  const pair = `${pool.base} / ${pool.quote}`;
  const count = usePortfolio(
    state => state.positions.filter(position => position.pool === pair).length
  );

  if (!user) {
    return (
      <p className="py-10 text-center text-muted">
        <button
          type="button"
          onClick={openSignIn}
          className="min-h-11 text-fg underline underline-offset-4"
        >
          Sign in
        </button>{' '}
        to see your {pool.base} positions, earned fees and callouts.
      </p>
    );
  }

  return (
    <p className="py-10 text-center text-muted">
      You have {count} open {count === 1 ? 'position' : 'positions'} in {pair}.{' '}
      <Link href="/portfolio" className="text-fg underline underline-offset-4">
        View portfolio
      </Link>
    </p>
  );
}

const cellClass = 'border-t border-line py-3 pr-4 align-middle last:pr-0 last:text-right';

/** Bottom tabs of the pool page (brief 8.1). */
export function PoolTabs({ pool }: PoolTabsProps) {
  const [tab, setTab] = useState<PoolTab>('callouts');
  const { own, others } = useAllCallouts();
  const callouts = [...own, ...others];
  const ownIds = new Set(own.map(callout => callout.id));
  const tabItems: readonly { value: PoolTab; label: string }[] = [
    { value: 'callouts', label: `Callouts · ${callouts.length}` },
    { value: 'positions', label: 'Positions' },
    { value: 'top-lps', label: 'Top LPs' },
    { value: 'trades', label: 'Trades' },
  ];

  return (
    <Tabs label="Pool activity" items={tabItems} value={tab} onChange={setTab} className="min-w-0">
      {tab === 'callouts' ? (
        callouts.length > 0 ? (
          <div className="-mx-gutter">
            {callouts.map(callout => (
              <CalloutPost key={callout.id} callout={callout} own={ownIds.has(callout.id)} />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-muted">No callouts yet. Be the first.</p>
        )
      ) : null}

      {tab === 'positions' ? <PoolPositions pool={pool} /> : null}

      {tab === 'top-lps' ? (
        <Table head={['#', 'LP', 'Value', 'Earned', 'In range']}>
          {topLps.map(lp => (
            <tr key={lp.rank}>
              <td className={cellClass}>{lp.rank}</td>
              <td className={cn(cellClass, 'font-sans text-[0.9375rem]')}>{lp.handle}</td>
              <td className={cellClass}>{formatCompactUsd(lp.valueUsd)}</td>
              <td className={cn(cellClass, 'text-up')}>+{formatCompactUsd(lp.earnedUsd)}</td>
              <td className={cellClass}>{lp.inRangePct}%</td>
            </tr>
          ))}
        </Table>
      ) : null}

      {tab === 'trades' ? (
        <Table head={['Side', 'USD', pool.base, 'Trader', 'Age']}>
          {recentTrades.map(trade => (
            <tr key={trade.id}>
              <td
                className={cn(
                  cellClass,
                  trade.side === 'buy' ? 'text-up' : 'text-down',
                  'uppercase'
                )}
              >
                {trade.side}
              </td>
              <td className={cellClass}>{formatCompactUsd(trade.amountUsd)}</td>
              <td className={cellClass}>{formatTokenAmount(trade.amountBase)}</td>
              <td className={cellClass}>{trade.trader}</td>
              <td className={cellClass}>{trade.age}</td>
            </tr>
          ))}
        </Table>
      ) : null}
    </Tabs>
  );
}
