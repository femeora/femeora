'use client';

import { ApiIndexedPositionListSchema, type ApiIndexedPosition } from '@fomeora/types';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { formatUnits } from 'viem';

import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { TokenPair } from '@/components/ui/TokenPair';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import { PostPositionCalloutButton } from '@/features/callouts/components/PostPositionCalloutButton';
import type { Callout } from '@/features/callouts/model/callout';
import { useAllCallouts } from '@/features/callouts/useAllCallouts';
import { PositionActionPanel } from '@/features/portfolio/components/PositionActionPanel';
import { useWallet } from '@/features/wallet/store';
import { useApiResource } from '@/lib/api/useApiResource';
import { cn } from '@/lib/cn';
import { tokenSymbol } from '@/lib/tokens';

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

function positionStatus(position: ApiIndexedPosition): string {
  if (position.status !== 'open') return position.status;
  const active = position.pool.activeBin;
  if (active === null) return position.pool.type === 'DAMM' ? 'in range' : 'unknown';
  return active >= position.lowerBin && active <= position.upperBin ? 'in range' : 'out of range';
}

const strategyCopy = {
  'buy-the-dip': { label: 'Buy the dip', tone: 'text-up border-up/40 bg-up/5' },
  'sell-into-strength': { label: 'Sell into strength', tone: 'text-signal border-signal/40 bg-signal/5' },
  'fee-farm': { label: 'Fee farm', tone: 'text-white border-white/35 bg-white/5' },
  custom: { label: 'Custom range', tone: 'text-muted border-line bg-panel/40' },
} as const;

function strategyDescription(position: ApiIndexedPosition, pool: Pool): string {
  if (position.strategy === 'buy-the-dip') return `Single-sided ${pool.quote} below market price`;
  if (position.strategy === 'sell-into-strength') return `Single-sided ${pool.base} above market price`;
  if (position.strategy === 'fee-farm') return `${pool.base} + ${pool.quote} around market price`;
  return 'Custom liquidity distribution';
}

function tokenAmount(value: string | null, symbol: string): string {
  if (value === null) return 'Unavailable';
  const number = Number(value);
  if (!Number.isFinite(number)) return `${value} ${symbol}`;
  return `${new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 7,
    useGrouping: false,
  }).format(number)} ${symbol}`;
}

function tradeAmount(raw: string, address: string, pool: Pool): string {
  const tokenX = address.toLowerCase() === pool.tokenX.toLowerCase();
  const decimals = tokenX ? pool.tokenXDecimals : pool.tokenYDecimals;
  const symbol = tokenSymbol(address);
  return decimals === null ? `${symbol} unavailable` : `${formatUnits(BigInt(raw), decimals)} ${symbol}`;
}

/** All canonical positions for this pool. Portfolio remains wallet-scoped. */
function PoolPositions({ pool, positions, error, isLoading, refresh }: {
  pool: Pool;
  positions: readonly ApiIndexedPosition[];
  error: Error | undefined;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
}) {
  const account = useWallet(state => state.account);
  const [managingId, setManagingId] = useState<string | null>(null);
  if (isLoading) return <p className="py-10 text-center text-muted">Loading canonical pool positions…</p>;
  if (error) return <div role="alert" className="py-10 text-center"><p className="text-down">Pool positions are temporarily unavailable.</p><button type="button" onClick={() => void refresh()} className="t-label mt-3 min-h-11 underline underline-offset-4">Retry</button></div>;
  if (positions.length === 0) return <p className="py-10 text-center text-muted">No indexed positions in this pool yet.</p>;
  return <div className="mt-4 space-y-3">
    {positions.map(position => {
      const owned = account?.toLowerCase() === position.owner.toLowerCase();
      const manageable = owned && position.status === 'open';
      const strategy = strategyCopy[position.strategy];
      const status = positionStatus(position);
      return <Fragment key={`${position.chainId}:${position.id}`}>
        <article className="glass rounded-[2px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <TokenPair
                tokenX={pool.baseAddress}
                tokenY={pool.quoteAddress}
                tokenXIdentity={{ symbol: pool.base, name: pool.baseName, logoUrl: pool.baseLogoUrl }}
                tokenYIdentity={{ symbol: pool.quote, name: pool.quoteName, logoUrl: pool.quoteLogoUrl }}
                compact
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">Position #{position.id}</p>
                  <span className={cn('t-label rounded-[2px] border px-2 py-1', strategy.tone)}>{strategy.label}</span>
                  <span className={cn('t-label rounded-[2px] border border-line px-2 py-1 capitalize', status === 'in range' ? 'text-up' : 'text-muted')}>{status}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{strategyDescription(position, pool)}</p>
                <p className="t-label mt-2 text-faint">Owner {shortAddress(position.owner)}{owned ? <span className="ml-2 text-signal">You</span> : null}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
            {owned && position.status === 'open' && !position.calloutId ? <PostPositionCalloutButton position={position} onPosted={refresh} /> : null}
            {manageable ? <Button className="min-h-9" onClick={() => setManagingId(current => current === position.id ? null : position.id)}>{managingId === position.id ? 'Hide' : 'Manage'}</Button> : null}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-3 xl:grid-cols-5">
            <div><dt className="t-label text-faint">Range</dt><dd className="mt-1 font-mono text-sm tabular-nums">{position.lowerBin}–{position.upperBin}<span className="ml-2 text-faint">{position.bins.length} bins</span></dd></div>
            <div><dt className="t-label text-faint">Distribution</dt><dd className="mt-1 text-sm">{['Spot', 'Curve', 'Bid-Ask', 'Custom'][position.shape] ?? 'Custom'}</dd></div>
            <div><dt className="t-label text-faint">Position value</dt><dd className="mt-1 font-mono text-sm tabular-nums">{tokenAmount(position.valueQuote ?? position.depositedQuote, pool.quote)}</dd></div>
            <div><dt className="t-label text-faint">Fees earned</dt><dd className="mt-1 font-mono text-sm tabular-nums text-up">{tokenAmount(position.earnedQuote, pool.quote)}</dd></div>
            <div><dt className="t-label text-faint">Callout</dt><dd className="mt-1 text-sm">{position.calloutId ? 'Posted' : position.poolCanonical ? 'Not posted' : 'Legacy pool'}</dd></div>
          </dl>
          {managingId === position.id ? <div className="mt-4 border-t border-line pt-4"><PositionActionPanel position={position} onConfirmed={refresh} /></div> : null}
        </article>
      </Fragment>;
    })}
  </div>;
}

const cellClass = 'border-t border-line py-3 pr-4 align-middle last:pr-0 last:text-right';

/** Bottom tabs of the pool page (brief 8.1). */
export function PoolTabs({ pool, trades, lps, callouts: canonicalCallouts }: PoolTabsProps) {
  const [tab, setTab] = useState<PoolTab>('positions');
  const { own } = useAllCallouts(false);
  const positionsResource = useApiResource(
    `/v1/positions?pool=${encodeURIComponent(pool.address)}&limit=200`,
    ApiIndexedPositionListSchema,
  );
  const refreshPositions = positionsResource.mutate;
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ pool?: string }>).detail;
      if (detail?.pool?.toLowerCase() === pool.address.toLowerCase()) void refreshPositions();
    };
    window.addEventListener('fomeora:pool-update', refresh);
    return () => window.removeEventListener('fomeora:pool-update', refresh);
  }, [pool.address, refreshPositions]);
  const positions = positionsResource.data?.data ?? [];
  const callouts = [...own, ...canonicalCallouts];
  const ownIds = new Set(own.map(callout => callout.id));
  const tabItems: readonly { value: PoolTab; label: string }[] = [
    { value: 'callouts', label: `Callouts · ${callouts.length}` },
    { value: 'positions', label: `Positions · ${positions.length}` },
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

      {tab === 'positions' ? <PoolPositions
        pool={pool}
        positions={positions}
        error={positionsResource.error}
        isLoading={positionsResource.isLoading && !positionsResource.data}
        refresh={() => refreshPositions()}
      /> : null}

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
        <Table head={['Side', 'Amount received', 'Amount paid', 'Trader', 'Time']}>
          {trades.map(trade => {
            const baseIn = trade.tokenIn.toLowerCase() === pool.baseAddress.toLowerCase();
            const tokenOut = trade.tokenIn.toLowerCase() === pool.tokenX.toLowerCase()
              ? pool.tokenY
              : pool.tokenX;
            return (
            <tr key={`${trade.transactionHash}:${trade.logIndex}`}>
              <td
                className={cn(
                  cellClass,
                  baseIn ? 'text-down' : 'text-up',
                  'uppercase'
                )}
              >
                {baseIn ? 'sell' : 'buy'}
              </td>
              <td className={cellClass}>{tradeAmount(trade.amountOut, tokenOut, pool)}</td>
              <td className={cellClass}>{tradeAmount(trade.amountIn, trade.tokenIn, pool)}</td>
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
