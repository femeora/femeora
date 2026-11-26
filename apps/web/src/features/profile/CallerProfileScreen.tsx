'use client';

import { ApiPoolAssetListSchema, ApiUserProfileSchema } from '@fomeora/types';
import { useMemo, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import { apiFeedCalloutToCallout } from '@/features/callouts/model/fromApi';
import { useSession } from '@/features/session/store';
import { useApiResource } from '@/lib/api/useApiResource';

type Filter = 'all' | 'open' | 'closed';
const FILTERS = [
  { value: 'all' as const, label: 'All' },
  { value: 'open' as const, label: 'Open' },
  { value: 'closed' as const, label: 'Closed' },
];

function duration(seconds: number): string {
  if (seconds < 3_600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

export function CallerProfileScreen({ handle }: { handle: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const profile = useApiResource(`/v1/users/${encodeURIComponent(handle)}`, ApiUserProfileSchema);
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const session = useSession(state => state.user);
  const assetsByAddress = useMemo(
    () => new Map((assets.data?.data ?? []).map(asset => [asset.address.toLowerCase(), asset])),
    [assets.data],
  );
  const callouts = useMemo(() => (profile.data?.callouts ?? [])
    .map(callout => apiFeedCalloutToCallout(callout, new Date(), assetsByAddress))
    .filter(callout => filter === 'all' || (filter === 'closed' ? callout.closed : !callout.closed)),
  [assetsByAddress, filter, profile.data?.callouts]);

  if (profile.isLoading) return <div className="mx-auto max-w-4xl px-gutter py-16 text-center text-muted">Loading proof-backed profile…</div>;
  if (profile.error || !profile.data) return <div className="mx-auto max-w-4xl px-gutter py-16 text-center text-down">Caller profile is temporarily unavailable.</div>;
  const { user, trackRecord } = profile.data;
  const allTime = profile.data.stats.find(stat => stat.window === 'all');
  const season = profile.data.stats.find(stat => stat.window === '7d');

  return (
    <div className="mx-auto max-w-4xl border-x border-line">
      <header className="border-b border-line px-gutter py-8">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar seed={user.handle} src={user.avatarUrl} alt={`${user.name ?? user.handle} avatar`} size="lg" />
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-medium">{user.name ?? user.handle}</h1>{user.xVerified ? <BadgeCheck className="size-5 text-signal" aria-label="X verified" /> : null}</div>
            <p className="text-muted">@{user.handle.replace(/^@/, '')}</p>
          </div>
          <div className="t-label ml-auto text-right text-muted"><strong className="block text-lg text-fg">{user.followers}</strong>Femeora followers</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {season && season.rank > 0 && season.rank <= 10 ? <span className="rounded-[2px] border border-signal px-2 py-1 text-xs text-signal">Top 10 caller · season</span> : null}
          {trackRecord.quickExits === 0 ? <span className="rounded-[2px] border border-line px-2 py-1 text-xs">0 quick exits</span> : null}
        </div>
        <dl className="mt-7 grid gap-px bg-line sm:grid-cols-4">
          {[
            ['Open / closed', `${trackRecord.openCallouts} / ${trackRecord.closedCallouts}`],
            ['Earned · quote', allTime?.earnedQuote ?? '0'],
            ['Median in range', `${trackRecord.medianInRange.toFixed(2)}%`],
            ['Average hold', duration(trackRecord.averageHoldSeconds)],
            ['Tailers', String(allTime?.tailers ?? 0)],
            ['Quick exits', String(trackRecord.quickExits)],
            ['Season points', season?.score ?? '0'],
            ['Season rank', season?.rank ? `#${season.rank}` : '—'],
          ].map(([label, value]) => <div key={label} className="bg-panel p-4"><dt className="t-label text-faint">{label}</dt><dd className="mt-2 font-mono tabular-nums">{value}</dd></div>)}
        </dl>
      </header>
      <div className="flex items-center justify-between border-b border-line px-gutter py-3">
        <h2 className="font-medium">Callouts</h2>
        <SegmentedControl label="Callout status" options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {callouts.length === 0 ? <p className="px-gutter py-14 text-center text-muted">No {filter === 'all' ? '' : filter} callouts yet.</p> : callouts.map(callout => <CalloutPost key={callout.id} callout={callout} own={session?.id === user.id} />)}
    </div>
  );
}
