'use client';

import type { ApiIndexedPosition } from '@fomeora/types';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { XLogo } from '@/components/ui/icons';
import { TokenPair } from '@/components/ui/TokenPair';
import { PostPositionCalloutButton } from '@/features/callouts/components/PostPositionCalloutButton';
import { useSession } from '@/features/session/store';
import { useWallet } from '@/features/wallet/store';
import { openApiEventStream } from '@/lib/api/realtime';

import { usePositions } from '../usePositions';

import { PositionActionPanel } from './PositionActionPanel';

const cell = 'border-t border-line py-3 pr-4 align-middle last:pr-0';
const shapeLabel = ['Spot', 'Curve', 'Bid-Ask', 'Custom'] as const;

function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }

function sumDecimal(values: readonly string[]): string {
  const scale = 10n ** 18n;
  const total = values.reduce((sum, value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(18, '0').slice(0, 18) || '0');
  }, 0n);
  const whole = total / scale;
  const fraction = (total % scale).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function WalletRequired({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-gutter py-24 text-center">
      <h1 className="text-h3 font-medium">Your positions live here.</h1>
      <p className="text-muted">Connect the wallet that owns your positions. An X account is only needed for social actions such as posting a callout.</p>
      <Button variant="primary" onClick={onConnect}>Connect wallet</Button>
    </div>
  );
}

function positionStatus(position: ApiIndexedPosition): string {
  if (position.status !== 'open') return position.status;
  const active = position.pool.activeBin;
  if (active === null) return position.pool.type === 'DAMM' ? 'in range' : 'unknown';
  return active >= position.lowerBin && active <= position.upperBin ? 'in range' : 'out of range';
}

/** Canonical owner portfolio. The indexer/API is the only position source of truth. */
export function PortfolioScreen() {
  const { user, openSignIn, signOut } = useSession();
  const { account, connect, status: walletStatus } = useWallet();
  const { data, error, isLoading, mutate } = usePositions();
  const [managingId, setManagingId] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return undefined;
    return openApiEventStream(`/v1/positions/${account}/stream`, {
      onMessage: () => void mutate(),
    });
  }, [account, mutate]);

  if (!account && (walletStatus === 'idle' || walletStatus === 'connecting')) {
    return <div className="mx-auto max-w-md px-gutter py-24 text-center text-muted">Loading connected wallet…</div>;
  }
  if (!account) return <WalletRequired onConnect={() => void connect()} />;
  const positions = data?.data ?? [];
  const openPositions = positions.filter(position => position.status === 'open');
  const totals = [
    { label: 'Deposited · quote', value: sumDecimal(positions.map(position => position.depositedQuote)) },
    { label: 'Withdrawn · quote', value: sumDecimal(positions.map(position => position.withdrawnQuote)) },
    { label: 'Earned · quote', value: sumDecimal(positions.map(position => position.earnedQuote)) },
    { label: 'Open positions', value: String(openPositions.length) },
    { label: 'Callouts', value: String(positions.filter(position => position.calloutId).length) },
  ];

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-center gap-4"><Avatar seed={user?.handle ?? account} src={user?.avatarUrl} alt={user ? `${user.name} X avatar` : 'Connected wallet avatar'} size="xl" self /><div>
          <h1 className="text-2xl font-medium">{user ? `@${user.handle}` : short(account)}</h1>
          <p className="t-label mt-1 break-all text-muted">Wallet {account} · indexed on-chain positions</p>
        </div></div>
        {user ? (
          <Button onClick={signOut} className="min-h-9">Disconnect X</Button>
        ) : (
          <Button onClick={openSignIn} className="min-h-9"><XLogo className="size-3.5" /> Connect X <span className="text-muted">· optional</span></Button>
        )}
      </header>
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">{totals.map(total => (
        <div key={total.label} className="glass rounded-[2px] p-4"><dt className="t-label text-muted">{total.label}</dt><dd className="mt-1 break-all text-xl font-medium tabular-nums">{total.value}</dd></div>
      ))}</dl>
      <h2 className="t-label mb-2 mt-8 text-muted">Positions</h2>
      {isLoading ? <div className="glass rounded-[2px] p-6 text-muted">Loading canonical positions…</div> : null}
      {error ? <div role="alert" className="glass rounded-[2px] p-6"><p className="text-down">Positions unavailable. No local fallback is shown.</p><button type="button" onClick={() => void mutate()} className="t-label mt-3 min-h-11 text-signal underline underline-offset-4">Retry</button></div> : null}
      {!isLoading && !error && positions.length === 0 ? (
        <div className="glass flex flex-col items-start gap-4 rounded-[2px] p-6"><p className="text-muted">No indexed positions for this linked wallet.</p><ButtonLink href="/pools" variant="primary">Open a position</ButtonLink></div>
      ) : null}
      {!isLoading && !error && positions.length > 0 ? (
        <div className="glass overflow-x-auto rounded-[2px] px-4"><table className="w-full min-w-[58rem] text-left">
          <thead><tr className="t-label text-faint">{['Pool', 'Shape', 'Range', 'Deposited', 'Withdrawn', 'Value · quote', 'Earned', 'Status', 'Callout', 'Actions'].map(head => <th key={head} scope="col" className="py-3 pr-4 font-normal">{head}</th>)}</tr></thead>
          <tbody className="font-mono text-[0.8125rem] tabular-nums">{positions.map(position => (
            <Fragment key={`${position.chainId}:${position.id}`}><tr>
              <td className={`${cell} font-sans`}><Link className="inline-flex hover:underline" href={`/p/${position.chainId}/${position.pool.address}`}>
                <TokenPair
                  tokenX={position.pool.baseIsTokenX === false ? position.pool.tokenY : position.pool.tokenX}
                  tokenY={position.pool.baseIsTokenX === false ? position.pool.tokenX : position.pool.tokenY}
                  compact
                />
              </Link></td>
              <td className={cell}>{shapeLabel[position.shape] ?? 'Custom'}</td>
              <td className={cell}>Bin {position.lowerBin} to {position.upperBin}<span className="block text-faint">{position.bins.length} owned bins</span></td>
              <td className={cell}>{position.depositedQuote}</td><td className={cell}>{position.withdrawnQuote}</td>
              <td className={cell}>{position.valueQuote ?? 'Unavailable'}</td><td className={cell}>{position.earnedQuote}</td>
              <td className={`${cell} capitalize`}>{positionStatus(position)}</td><td className={cell}>{position.calloutId ? 'Posted' : position.poolCanonical ? 'Not posted' : 'Legacy pool'}</td>
              <td className={cell}><div className="flex gap-2">
                {!position.calloutId && position.status === 'open' ? <PostPositionCalloutButton position={position} onPosted={mutate} /> : null}
                {position.status === 'open' ? <Button className="min-h-9" onClick={() => setManagingId(current => current === position.id ? null : position.id)}>{managingId === position.id ? 'Hide' : 'Manage'}</Button> : null}
              </div></td>
            </tr>
            {managingId === position.id ? <tr><td colSpan={10}><PositionActionPanel position={position} onConfirmed={mutate} /></td></tr> : null}</Fragment>
          ))}</tbody>
        </table></div>
      ) : null}
    </div>
  );
}
