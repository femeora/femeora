import type { Metadata } from 'next';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { LaunchCard } from '@/features/launch/components/LaunchCard';
import { getLaunchpads, getLaunches } from '@/lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Launchpads · Femeora',
  description: 'Build and discover token launchpads on Femeora.',
};

export default async function LaunchpadsPage() {
  const [launchpads, launches] = await Promise.all([
    getLaunchpads().catch(() => ({ data: [] })),
    getLaunches().catch(() => ({ data: [] })),
  ]);
  return (
    <section className="px-gutter py-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
        <div>
          <p className="t-label text-signal">Launchpad for launchpads</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Launch on Femeora</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Create a branded launchpad, trade tokens on fully on-chain curves, and graduate
            liquidity into a permanently locked DAMM position.
          </p>
        </div>
        <ButtonLink href="/launchpads/create" variant="primary">
          Create launchpad
        </ButtonLink>
      </header>

      <div className="mt-9 flex items-end justify-between border-b border-line pb-3">
        <div>
          <p className="t-label text-up">Permissionless builders</p>
          <h2 className="mt-1 text-xl font-medium">Launchpad directory</h2>
        </div>
        <p className="t-label text-muted">
          {launchpads.data.filter(pad => pad.active).length} active · {launchpads.data.length} total
        </p>
      </div>
      {launchpads.data.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {launchpads.data.map(pad => (
            <li key={pad.id}>
              <a
                href={`/lp/${pad.slug}`}
                className="glass block min-h-48 overflow-hidden rounded-[2px] transition-colors hover:border-line-strong"
              >
                {pad.bannerUrl ? (
                  <div className="h-20 border-b border-line">
                    <img
                      src={pad.bannerUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-12 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-panel-2 font-mono">
                      {pad.logoUrl ? (
                        <img
                          src={pad.logoUrl}
                          alt={`${pad.name} logo`}
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      ) : (
                        pad.name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span
                      className={`t-label border px-2 py-1 ${pad.active ? 'border-up/40 text-up' : 'border-line text-muted'}`}
                    >
                      {pad.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-medium">{pad.name}</h3>
                  <p className="t-label mt-1 text-muted">
                    @{pad.xHandle} · /{pad.slug}
                  </p>
                  <dl className="t-label mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
                    <div>
                      <dt className="text-faint">Launches</dt>
                      <dd className="mt-1 text-fg">{pad.launchCount}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Trade fee</dt>
                      <dd className="mt-1 text-fg">{pad.tradeFeePips / 10_000}%</dd>
                    </div>
                  </dl>
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass mt-4 p-8 text-center">
          <h3 className="text-lg font-medium">The first launchpad is waiting for its builder.</h3>
          <p className="mt-2 text-muted">
            Configure identity, economics, graduation, and protection in one guided flow.
          </p>
        </div>
      )}

      <div className="mt-12 flex items-end justify-between border-b border-line pb-3">
        <div>
          <p className="t-label text-signal">Curve activity</p>
          <h2 className="mt-1 text-xl font-medium">Latest launches</h2>
        </div>
        <p className="t-label text-muted">{launches.data.length} indexed</p>
      </div>
      {launches.data.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {launches.data.map(launch => (
            <li key={launch.id}>
              <LaunchCard launch={launch} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass mt-4 p-6 text-sm text-muted">
          Tokens will appear here as soon as their launch transaction reaches the indexed safe
          block.
        </p>
      )}
    </section>
  );
}
