'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Callout } from '@/features/callouts/model/callout';

/** Delay between buffered arrivals, standing in for `callout.new` SSE events (brief 7.2). */
const ARRIVAL_MS = 12_000;

/**
 * Buffers new callouts instead of inserting them, so content never shifts under the
 * reader. `release()` moves the buffer into the list (the "New callouts" pill).
 */
export function useIncomingCallouts(stream: readonly Callout[]) {
  const [buffered, setBuffered] = useState<Callout[]>([]);
  const [released, setReleased] = useState<Callout[]>([]);

  useEffect(() => {
    const timers = stream.map((item, index) =>
      setTimeout(() => setBuffered(current => [item, ...current]), ARRIVAL_MS * (index + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [stream]);

  const release = useCallback(() => {
    setReleased(current => [...buffered, ...current]);
    setBuffered([]);
  }, [buffered]);

  return { buffered, released, release };
}
