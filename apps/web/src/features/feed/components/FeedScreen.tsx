'use client';

import { ApiFeedSchema } from '@fomeora/types';
import { useCallback, useId, useMemo, useState } from 'react';

import { Tabs } from '@/components/ui/Tabs';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import { apiFeedCalloutToCallout } from '@/features/callouts/model/fromApi';
import { useSession } from '@/features/session/store';
import { useApiResource } from '@/lib/api/useApiResource';

import { useFeedRealtime } from '../hooks/useFeedRealtime';
import { filterBySide, SIDE_FILTERS, type FeedTab, type SideFilter } from '../model/feed';

import { FeedRail } from './FeedRail';
import { NewCalloutsPill } from './NewCalloutsPill';

const tabItems: readonly { value: FeedTab; label: string }[] = [
  { value: 'callouts', label: 'Callouts' },
  { value: 'following', label: 'Following' },
  { value: 'best', label: 'Best' },
];

/** API-backed feed. SSE only buffers notification IDs; REST remains the source of truth. */
export function FeedScreen() {
  const [tab, setTab] = useState<FeedTab>('callouts');
  const [side, setSide] = useState<SideFilter>('all');
  const sideId = useId();
  const user = useSession(state => state.user);
  const openSignIn = useSession(state => state.openSignIn);
  const path = tab === 'following' && !user ? null : `/v1/feed?tab=${tab}&limit=50&window=24h`;
  const { data, error, isLoading, mutate } = useApiResource(path, ApiFeedSchema);
  const refresh = useCallback(() => mutate(), [mutate]);
  const { pendingCount, streamError, release } = useFeedRealtime(refresh);
  const visible = useMemo(
    () => filterBySide((data?.data ?? []).map(callout => apiFeedCalloutToCallout(callout)), side),
    [data, side],
  );
  const ownIds = new Set((data?.data ?? []).filter(callout => callout.user.id === user?.id).map(callout => callout.id));
  const showNew = async () => {
    await release();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto grid max-w-[76rem] xl:grid-cols-[minmax(0,44rem)_minmax(0,1fr)] xl:gap-10">
      <div className="min-w-0 border-line md:border-x">
        <Tabs label="Feed" items={tabItems} value={tab} onChange={setTab} listClassName="glass-raised sticky top-[var(--app-header-height)] z-10 items-center border-x-0 border-t-0 px-gutter" trailing={
          <><label htmlFor={sideId} className="sr-only">Filter by side</label><select id={sideId} value={side} onChange={event => {
            const next = SIDE_FILTERS.find(option => option.value === event.target.value);
            if (next) setSide(next.value);
          }} className="glass-control t-label ml-auto min-h-9 w-[8.5rem] min-w-0 shrink rounded-[2px] px-2 text-fg sm:w-auto [&>option]:bg-panel">
            {SIDE_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></>
        }>
          {tab === 'callouts' ? <NewCalloutsPill count={pendingCount} onShow={() => void showNew()} /> : null}
          {tab === 'following' && !user ? <div className="px-gutter py-16 text-center"><p className="text-lg">Sign in to view followed callers.</p><button type="button" onClick={openSignIn} className="mt-3 min-h-11 text-signal underline underline-offset-4">Sign in with X</button></div> : null}
          {path && isLoading ? <p className="px-gutter py-16 text-center text-muted">Loading canonical callouts…</p> : null}
          {path && error ? <div role="alert" className="px-gutter py-16 text-center"><p className="text-down">Feed unavailable.</p><button type="button" onClick={() => void refresh()} className="mt-3 min-h-11 text-signal underline underline-offset-4">Retry</button></div> : null}
          {path && !isLoading && !error && visible.length === 0 ? <p className="px-gutter py-16 text-center text-muted">No canonical callouts match this tab and side.</p> : null}
          {path && !isLoading && !error ? visible.map(callout => <CalloutPost key={callout.id} callout={callout} own={ownIds.has(callout.id)} />) : null}
          {streamError ? <p className="t-label px-gutter py-3 text-center text-muted">Realtime reconnecting; REST data remains available.</p> : null}
        </Tabs>
      </div>
      <FeedRail />
    </div>
  );
}
