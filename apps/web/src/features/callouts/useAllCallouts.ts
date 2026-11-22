'use client';

import { useMemo } from 'react';

import { usePortfolio } from '@/features/portfolio/store';
import { useSession } from '@/features/session/store';

import type { Callout } from './model/callout';
import { poolCallouts } from './model/data';
import { positionToCallout } from './model/fromPosition';

/** The signed-in user's posted callouts (newest first) followed by everyone else's. */
export function useAllCallouts(): { own: readonly Callout[]; others: readonly Callout[] } {
  const user = useSession(state => state.user);
  const positions = usePortfolio(state => state.positions);

  const own = useMemo(
    () => (user ? positions.flatMap(position => positionToCallout(position, user) ?? []) : []),
    [positions, user]
  );

  return { own, others: poolCallouts };
}
