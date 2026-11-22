'use client';

import { MiniBins } from '@/components/callout/MiniBins';
import { RangeStatus } from '@/components/callout/RangeStatus';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { XLogo } from '@/components/ui/icons';
import { SpanText } from '@/components/ui/SpanText';
import { formatCompactUsd, rangeSpan } from '@/features/pool/model/format';
import { useSession } from '@/features/session/store';

import { usePortfolio, type UserPosition } from '../store';

const cell = 'border-t border-line py-3 pr-4 align-middle last:pr-0';

const isInRange = (position: UserPosition) => position.minPct <= 0 && position.maxPct >= 0;

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-gutter py-24 text-center">
      <h1 className="text-h3 font-medium">Your positions live here.</h1>
      <p className="text-muted">
        Sign in with X and link a wallet to see your ranges, earned fees and callouts.
      </p>
      <Button variant="primary" onClick={onSignIn}>
        <XLogo className="size-3.5" /> Sign in<span className="sr-only"> with X</span>
      </Button>
    </div>
  );
}

/** Portfolio (brief 3): identity, totals, and every open position with its callout state. */
export function PortfolioScreen() {
  const { user, openSignIn, signOut } = useSession();
  const positions = usePortfolio(state => state.positions);

  if (!user) return <SignedOut onSignIn={openSignIn} />;

  const totals = [
    {
      label: 'Deposited',
      value: formatCompactUsd(positions.reduce((sum, p) => sum + p.depositUsd, 0)),
    },
    { label: 'Earned', value: '+$0.00' },
    { label: 'Open positions', value: String(positions.length) },
    { label: 'Callouts', value: String(positions.filter(p => p.callout).length) },
  ];

  return (
    <div className="mx-auto max-w-[64rem] px-gutter py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-full bg-signal font-mono text-sm text-on-signal"
          >
            {user.initials}
          </span>
          <div>
            <h1 className="text-2xl font-medium">@{user.handle}</h1>
            <p className="t-label mt-1 text-muted">Wallet {user.wallet} · linked with SIWE</p>
          </div>
        </div>
        <Button onClick={signOut} className="min-h-9">
          Sign out
        </Button>
      </header>

      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line md:grid-cols-4">
        {totals.map(total => (
          <div key={total.label} className="bg-bg py-5 pr-4">
            <dt className="t-label text-muted">{total.label}</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">{total.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="t-label mb-2 mt-8 text-muted">Positions</h2>
      {positions.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-t border-line py-10">
          <p className="text-muted">
            No positions yet. Open a range on a pool and post it as a callout.
          </p>
          <ButtonLink href="/pools" variant="primary">
            Open a position
          </ButtonLink>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="t-label text-faint">
                {['Pool', 'Shape', 'Range', 'Deposited', 'Status', 'Callout'].map(head => (
                  <th key={head} scope="col" className="py-3 pr-4 font-normal">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-[0.8125rem] tabular-nums">
              {positions.map(position => (
                <tr key={position.id}>
                  <td className={`${cell} font-sans text-[0.9375rem]`}>{position.pool}</td>
                  <td className={cell}>
                    <MiniBins shape={position.shape} count={8} className="h-4" />
                  </td>
                  <td className={cell}>
                    <SpanText value={rangeSpan(position.minPct, position.maxPct)} />
                    <span className="t-label block text-faint">
                      {position.side} · {position.bins} bins
                    </span>
                  </td>
                  <td className={cell}>{formatCompactUsd(position.depositUsd)}</td>
                  <td className={cell}>
                    <RangeStatus
                      status={isInRange(position) ? 'in-range' : 'out-of-range'}
                      className="t-label"
                    />
                  </td>
                  <td className={`${cell} t-label`}>
                    {position.callout ? 'Posted' : 'Not posted'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
