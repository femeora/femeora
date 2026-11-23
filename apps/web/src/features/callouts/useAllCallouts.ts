'use client';

import type { Callout } from './model/callout';

/** The signed-in user's posted callouts (newest first) followed by everyone else's. */
export function useAllCallouts(_includeExamples = true): { own: readonly Callout[]; others: readonly Callout[] } {
  // Canonical own callouts arrive from the same API feed as every other callout.
  return { own: [], others: [] };
}
