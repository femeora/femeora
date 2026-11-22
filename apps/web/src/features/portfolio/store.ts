'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BinShape } from '@/types/callout';

export interface UserPosition {
  id: string;
  pool: string;
  shape: BinShape;
  minPct: number;
  maxPct: number;
  side: string;
  bins: number;
  depositUsd: number;
  openedAt: number;
  /** Present when the position was posted as a callout. */
  callout: { caption: string; showSize: boolean } | null;
}

interface PortfolioState {
  positions: UserPosition[];
  addPosition: (position: Omit<UserPosition, 'id' | 'openedAt'>) => UserPosition;
}

/**
 * Positions opened from this browser. Seam for `GET /v1/positions?owner=` and the
 * PositionManagerV2 tx flow (brief 9.2, 11).
 */
export const usePortfolio = create<PortfolioState>()(
  persist(
    (set, get) => ({
      positions: [],
      addPosition: input => {
        const position: UserPosition = {
          ...input,
          id: `p${get().positions.length + 1}-${Date.now()}`,
          openedAt: Date.now(),
        };
        set(state => ({ positions: [position, ...state.positions] }));
        return position;
      },
    }),
    {
      name: 'fomeora-portfolio',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }
  )
);
