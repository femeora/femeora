'use client';

import { ApiFeedSchema } from '@fomeora/types';
import Link from 'next/link';
import { useCallback, useId, useMemo, useState } from 'react';

import { ArrowRight } from '@/components/ui/icons';
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

function EmptyFeed({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="px-gutter py-8 sm:py-12">
      <div className="glass relative overflow-hidden rounded-[2px] border border-line p-6 sm:p-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 size-48 rounded-full border border-fg/[0.06] shadow-[0_0_60px_rgb(var(--fg)/0.04)]" />
        <p className="t-label text-signal">The feed starts onchain</p>
        <h2 className="mt-3 max-w-md text-2xl font-medium tracking-tight">
          {filtered ? 'No callouts match this side yet.' : 'Be the first caller in this pool.'}
        </h2>
        <p className="mt-3 max-w-lg text-muted">
          Create a liquidity position, publish it as a callout, and it will appear here after the transaction reaches the safe block.
        </p>

        <ol className="mt-7 grid gap-px overflow-hidden rounded-[2px] bg-line sm:grid-cols-3">
          {['Choose a canonical pool', 'Create an LP range', 'Post it as a callout'].map((step, index) => (
            <li key={step} className="bg-panel/95 p-4">
              <span className="t-label text-faint">0{index + 1}</span>
              <span className="mt-2 block text-sm">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link href="/pools" className="glass-control t-label inline-flex min-h-11 items-center rounded-[2px] px-4 hover:border-line-strong">
            Browse pools <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </Link>
          {filtered ? <button type="button" onClick={onClear} className="min-h-11 text-sm text-muted underline underline-offset-4 hover:text-fg">Clear side filter</button> : null}
        </div>
      </div>
    </div>
  );
}

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
          {path && !isLoading && !error && visible.length === 0 ? <EmptyFeed filtered={side !== 'all'} onClear={() => setSide('all')} /> : null}
          {path && !isLoading && !error ? visible.map(callout => <CalloutPost key={callout.id} callout={callout} own={ownIds.has(callout.id)} />) : null}
          {streamError ? <p className="t-label px-gutter py-3 text-center text-muted">Realtime reconnecting; REST data remains available.</p> : null}
        </Tabs>
      </div>
      <FeedRail />
    </div>
  );
}
