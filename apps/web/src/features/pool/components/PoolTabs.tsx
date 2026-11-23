'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Tabs } from '@/components/ui/Tabs';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import type { Callout } from '@/features/callouts/model/callout';
import { useAllCallouts } from '@/features/callouts/useAllCallouts';
import { usePositions } from '@/features/portfolio/usePositions';
import { useSession } from '@/features/session/store';
import { cn } from '@/lib/cn';

import { formatTokenAmount } from '../model/format';
import { shortAddress, type LiveLp, type LiveTrade } from '../model/live';
import type { Pool } from '../model/pool';

type PoolTab = 'callouts' | 'positions' | 'top-lps' | 'trades';

interface PoolTabsProps {
  pool: Pool;
  trades: readonly LiveTrade[];
  lps: readonly LiveLp[];
  callouts: readonly Callout[];
}

function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="glass mt-4 overflow-x-auto rounded-[2px] px-4">
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
  const { data } = usePositions();
  const count = data?.data.filter(position =>
    position.pool.address.toLowerCase() === pool.address.toLowerCase() && position.status === 'open'
  ).length ?? 0;

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
export function PoolTabs({ pool, trades, lps, callouts: canonicalCallouts }: PoolTabsProps) {
  const [tab, setTab] = useState<PoolTab>('callouts');
  const { own } = useAllCallouts(false);
  const callouts = [...own, ...canonicalCallouts];
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
        <Table head={['#', 'LP', 'Value', 'Earned', 'Range']}>
          {lps.map((lp, index) => (
            <tr key={lp.id}>
              <td className={cellClass}>{index + 1}</td>
              <td className={cn(cellClass, 'font-sans text-[0.9375rem]')}>{shortAddress(lp.owner)}</td>
              <td className={cellClass}>{lp.valueQuote ?? '—'}</td>
              <td className={cn(cellClass, 'text-up')}>{lp.earnedQuote}</td>
              <td className={cellClass}>{lp.lowerBin}–{lp.upperBin}</td>
            </tr>
          ))}
        </Table>
      ) : null}

      {tab === 'trades' ? (
        <Table head={['Side', 'Out (raw)', 'In (raw)', 'Trader', 'Time']}>
          {trades.map(trade => {
            const tokenXIn = trade.tokenIn.toLowerCase() === pool.tokenX.toLowerCase();
            return (
            <tr key={`${trade.transactionHash}:${trade.logIndex}`}>
              <td
                className={cn(
                  cellClass,
                  tokenXIn ? 'text-down' : 'text-up',
                  'uppercase'
                )}
              >
                {tokenXIn ? 'sell' : 'buy'}
              </td>
              <td className={cellClass}>{formatTokenAmount(Number(trade.amountOut))}</td>
              <td className={cellClass}>{formatTokenAmount(Number(trade.amountIn))}</td>
              <td className={cellClass}>{shortAddress(trade.sender)}</td>
              <td className={cellClass}>{new Date(trade.timestamp).toLocaleString()}</td>
            </tr>
            );
          })}
        </Table>
      ) : null}
    </Tabs>
  );
}
