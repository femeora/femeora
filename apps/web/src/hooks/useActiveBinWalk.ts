'use client';

import { useEffect, useState } from 'react';

import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface ActiveBinWalkOptions {
  /** Number of bins in the displayed range. */
  count: number;
  /** How far past each edge the price may drift, in bins. */
  overshoot?: number;
  intervalMs?: number;
}

/**
 * Simulated active bin: a bounded random walk that stands in for live price
 * moves in the hero illustration. Holds still when reduced motion is requested.
 */
export function useActiveBinWalk({ count, overshoot = 3, intervalMs = 700 }: ActiveBinWalkOptions) {
  const start = Math.floor(count / 2);
  const [index, setIndex] = useState(start);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setIndex(start);
      return;
    }

    const id = window.setInterval(() => {
      setIndex(current => {
        const step = Math.random() < 0.5 ? -1 : 1;
        const next = current + step * (Math.random() < 0.2 ? 2 : 1);
        return Math.min(count - 1 + overshoot, Math.max(-overshoot, next));
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [count, overshoot, intervalMs, reducedMotion, start]);

  return { index, inRange: index >= 0 && index < count };
}
