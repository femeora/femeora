'use client';

import { create } from 'zustand';

import type { Callout } from './model/callout';

interface CalloutsState {
  liked: ReadonlySet<string>;
  reposted: ReadonlySet<string>;
  /** Tails made from this client, added on top of the server count. */
  extraTailers: Readonly<Record<string, number>>;
  /** Callout whose Tail sheet is open. */
  tailing: Callout | null;
  toggleLike: (id: string) => void;
  toggleRepost: (id: string) => void;
  openTail: (callout: Callout) => void;
  closeTail: () => void;
  recordTail: (id: string) => void;
}

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** Social actions on callouts (brief 7.4) and the Tail sheet (brief 6.1). */
export const useCallouts = create<CalloutsState>(set => ({
  liked: new Set(),
  reposted: new Set(),
  extraTailers: {},
  tailing: null,
  toggleLike: id => set(state => ({ liked: toggle(state.liked, id) })),
  toggleRepost: id => set(state => ({ reposted: toggle(state.reposted, id) })),
  openTail: callout => set({ tailing: callout }),
  closeTail: () => set({ tailing: null }),
  recordTail: id =>
    set(state => ({
      extraTailers: { ...state.extraTailers, [id]: (state.extraTailers[id] ?? 0) + 1 },
    })),
}));
