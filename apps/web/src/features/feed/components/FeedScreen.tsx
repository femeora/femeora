'use client';

import { useId, useState } from 'react';

import { Tabs } from '@/components/ui/Tabs';
import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import { incomingCallouts } from '@/features/callouts/model/data';
import { useAllCallouts } from '@/features/callouts/useAllCallouts';

import { useIncomingCallouts } from '../hooks/useIncomingCallouts';
import {
  bestCallouts,
  filterBySide,
  SIDE_FILTERS,
  type FeedTab,
  type SideFilter,
} from '../model/feed';

import { FeedRail } from './FeedRail';
import { NewCalloutsPill } from './NewCalloutsPill';

const tabItems: readonly { value: FeedTab; label: string }[] = [
  { value: 'callouts', label: 'Callouts' },
  { value: 'following', label: 'Following' },
  { value: 'best', label: 'Best' },
];

/** Feed home (brief 7): tabs, side filter, buffered new callouts and a right rail. */
export function FeedScreen() {
  const [tab, setTab] = useState<FeedTab>('callouts');
  const [side, setSide] = useState<SideFilter>('all');
  const sideId = useId();
  const { own, others } = useAllCallouts();
  const { buffered, released, release } = useIncomingCallouts(incomingCallouts);

  const ownIds = new Set(own.map(callout => callout.id));
  const all = [...own, ...released, ...others];
  const visible = filterBySide(tab === 'best' ? bestCallouts(all) : all, side);

  const showNew = () => {
    release();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto grid max-w-[76rem] xl:grid-cols-[minmax(0,44rem)_minmax(0,1fr)] xl:gap-10">
      <div className="min-w-0 border-line md:border-x">
        <Tabs
          label="Feed"
          items={tabItems}
          value={tab}
          onChange={setTab}
          listClassName="sticky top-14 z-10 items-center bg-bg/95 px-gutter backdrop-blur-md"
          trailing={
            <>
              <label htmlFor={sideId} className="sr-only">
                Filter by side
              </label>
              <select
                id={sideId}
                value={side}
                onChange={event => {
                  const next = SIDE_FILTERS.find(option => option.value === event.target.value);
                  if (next) setSide(next.value);
                }}
                className="t-label ml-auto min-h-9 w-[8.5rem] min-w-0 shrink rounded-[2px] border border-line-strong bg-bg px-2 text-fg sm:w-auto"
              >
                {SIDE_FILTERS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          }
        >
          {tab === 'callouts' ? <NewCalloutsPill items={buffered} onShow={showNew} /> : null}

          {tab === 'following' ? (
            <div className="px-gutter py-16 text-center">
              <p className="text-lg">Nothing here yet.</p>
              <p className="mt-2 text-muted">
                Follow callers from their profile to see their callouts in this tab.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="px-gutter py-16 text-center text-muted">
              No callouts match this side right now.
            </p>
          ) : (
            visible.map(callout => (
              <CalloutPost key={callout.id} callout={callout} own={ownIds.has(callout.id)} />
            ))
          )}
        </Tabs>
      </div>
      <FeedRail />
    </div>
  );
}
