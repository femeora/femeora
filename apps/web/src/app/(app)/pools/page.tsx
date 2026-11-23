import type { Metadata } from 'next';
import Link from 'next/link';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { TokenPair } from '@/components/ui/TokenPair';
import { getPools } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pools · Fomeora',
  description: 'Browse canonical liquidity pools indexed by Fomeora.',
};

export default async function PoolsPage() {
  let result;
  try {
    result = await getPools();
  } catch {
    return (
      <section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center px-gutter py-16">
        <p className="t-label text-signal">Indexer API unavailable</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Pools could not be loaded.</h1>
        <p className="mt-3 max-w-xl text-muted">
          The web app did not fall back to demo market data. Try again after the API service is healthy.
        </p>
        <Link href="/pools" className="t-label mt-5 min-h-11 w-fit text-signal underline underline-offset-4">Retry</Link>
      </section>
    );
  }

  return (
    <section className="px-gutter py-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5">
        <div><p className="t-label text-signal">Canonical index</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Liquidity pools</h1>
        <p className="mt-2 text-muted">Only pools confirmed by the active network indexer appear here.</p></div>
        <ButtonLink href="/pools/create" variant="primary">Create pool</ButtonLink>
      </header>

      {result.data.length === 0 ? (
        <div className="glass mt-6 rounded-[2px] p-8 text-center">
          <h2 className="text-lg font-medium">No testnet pools indexed yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted">
            Pool creation is permissionless on the deployed factory. A pool will appear here automatically
            after its creation transaction is confirmed and indexed at the safe block.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 lg:grid-cols-2">
          {result.data.map(pool => (
            <li key={pool.id} className="lg:only:col-span-2">
              <Link
                href={`/p/${pool.chainId}/${pool.address}`}
                className="glass group flex min-h-32 items-center justify-between gap-5 rounded-[2px] p-5 transition-colors hover:border-line-strong sm:p-6"
              >
                <div className="min-w-0">
                  <TokenPair tokenX={pool.tokenX} tokenY={pool.tokenY} />
                  <p className="mt-3 truncate font-mono text-xs text-faint">Pool {pool.address}</p>
                  <p className="t-label mt-2 text-muted">Robinhood Chain · {pool.type}</p>
                </div>
                <dl className="shrink-0 text-right font-mono text-xs tabular-nums">
                  <dt className="text-faint">Bin step</dt>
                  <dd className="mt-1">{pool.binStep / 100}%</dd>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
