import type { ApiLaunch } from '@fomeora/types';
import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck } from '@/components/ui/icons';

export function LaunchCard({
  launch,
  variant = 'launch',
}: {
  launch: ApiLaunch;
  variant?: 'launch' | 'graduation';
}) {
  const progress = Math.min(100, launch.progressPips / 10_000);
  const graduation = variant === 'graduation' && launch.graduation ? launch.graduation : null;
  const href = graduation ? `/p/${launch.chainId}/${graduation.pool}` : `/t/${launch.token}`;
  return (
    <Link
      href={href}
      className="glass group block w-full min-w-0 overflow-hidden rounded-[2px] p-4 transition-colors hover:border-line-strong sm:p-5"
    >
      {graduation ? (
        <p className="t-label mb-4 border-b border-up/30 pb-3 text-up">
          Graduated to DAMM · Launch LP permanently locked
        </p>
      ) : null}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-panel-2 font-mono text-sm">
            {launch.imageUrl ? (
              <img
                src={launch.imageUrl}
                alt={`${launch.name} logo`}
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
            ) : (
              launch.symbol.slice(0, 2)
            )}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-medium">
              {launch.name} <span className="text-muted">· {launch.symbol}</span>
            </h3>
            <p className="t-label mt-1 truncate text-faint">Launchpad · {launch.launchpad.name}</p>
          </div>
        </div>
        <span
          className={`t-label shrink-0 border px-2 py-1 ${launch.status === 'graduated' ? 'border-up/40 text-up' : 'border-signal/40 text-signal'}`}
        >
          {graduation ? 'Graduation' : launch.status === 'graduated' ? 'Graduated' : 'Curve live'}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {launch.creatorProfile ? (
          <span className="t-label inline-flex items-center gap-2 border border-line px-2 py-1 text-muted">
            <Avatar
              seed={launch.creatorProfile.handle}
              src={launch.creatorProfile.avatarUrl}
              alt={`${launch.creatorProfile.name ?? launch.creatorProfile.handle} avatar`}
              size="xs"
            />
            @{launch.creatorProfile.handle.replace(/^@/, '')}
            {launch.creatorProfile.xVerified ? (
              <BadgeCheck aria-label="X verified creator" className="size-3.5 text-signal" />
            ) : null}
          </span>
        ) : null}
        {launch.launchpad.protectionEnabled ? (
          <span className="t-label border border-signal/40 px-2 py-1 text-signal">
            Protected launch
          </span>
        ) : null}
        <span className="t-label border border-line px-2 py-1 text-faint">
          Dev allocation {(launch.devHoldingsPips / 10_000).toFixed(2)}%
        </span>
      </div>
      <div
        className="mt-5 h-2 overflow-hidden rounded-full bg-panel-2"
        aria-label={`${progress.toFixed(1)}% graduation progress`}
      >
        <div className="h-full bg-signal transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <div className="t-label mt-2 flex justify-between text-muted">
        <span>Graduation progress</span>
        <span>{progress.toFixed(2)}%</span>
      </div>
      <div className="t-label mt-4 flex flex-col gap-1 border-t border-line pt-3 text-faint min-[360px]:flex-row min-[360px]:justify-between">
        <span>
          {launch.token.slice(0, 8)}…{launch.token.slice(-6)}
        </span>
        <span>{launch.status === 'graduated' ? 'Locked launch LP' : 'Buy · sell on curve'}</span>
      </div>
    </Link>
  );
}
