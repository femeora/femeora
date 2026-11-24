'use client';

import { ApiIndexedPositionListSchema, type ApiIndexedPosition } from '@fomeora/types';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { formatUnits } from 'viem';

import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { TokenPair } from '@/components/ui/TokenPair';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
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
  return <Table head={['Pool', 'Owner', 'Shape', 'Range', 'Value · quote', 'Earned', 'Status', 'Actions']}>
    {positions.map(position => {
      const owned = account?.toLowerCase() === position.owner.toLowerCase();
      const manageable = owned && position.status === 'open';
      return <Fragment key={`${position.chainId}:${position.id}`}>
        <tr>
          <td className={cn(cellClass, 'font-sans')}><TokenPair tokenX={pool.baseAddress} tokenY={pool.quoteAddress} compact /></td>
          <td className={cellClass}>{shortAddress(position.owner)}{owned ? <span className="ml-2 text-signal">You</span> : null}</td>
          <td className={cellClass}>{['Spot', 'Curve', 'Bid-Ask', 'Custom'][position.shape] ?? 'Custom'}</td>
          <td className={cellClass}>{position.lowerBin}–{position.upperBin}<span className="block text-faint">{position.bins.length} bins</span></td>
          <td className={cellClass}>{position.valueQuote ?? 'Unavailable'}</td>
          <td className={cn(cellClass, 'text-up')}>{position.earnedQuote}</td>
          <td className={cn(cellClass, 'capitalize')}>{positionStatus(position)}</td>
          <td className={cellClass}>{manageable ? <Button className="min-h-9" onClick={() => setManagingId(current => current === position.id ? null : position.id)}>{managingId === position.id ? 'Hide' : 'Manage'}</Button> : <span className="text-faint">—</span>}</td>
        </tr>
        {managingId === position.id ? <tr><td colSpan={8}><PositionActionPanel position={position} onConfirmed={refresh} /></td></tr> : null}
      </Fragment>;
    })}
  </Table>;
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
