'use client';

import { useEffect } from 'react';

import { usePortfolio } from '@/features/portfolio/store';

import { useSession } from './store';

/** Loads persisted session and positions after mount, avoiding hydration mismatches. */
export function useRehydrateStores() {
  useEffect(() => {
    void useSession.persist.rehydrate();
    void usePortfolio.persist.rehydrate();
  }, []);
}
