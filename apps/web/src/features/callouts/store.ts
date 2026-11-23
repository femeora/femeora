'use client';

import { create } from 'zustand';

import type { Callout } from './model/callout';

interface CalloutsState {
  /** Callout whose Tail sheet is open. */
  tailing: Callout | null;
  openTail: (callout: Callout) => void;
  closeTail: () => void;
}

/** Social actions on callouts (brief 7.4) and the Tail sheet (brief 6.1). */
export const useCallouts = create<CalloutsState>(set => ({
  tailing: null,
  openTail: callout => set({ tailing: callout }),
  closeTail: () => set({ tailing: null }),
}));
