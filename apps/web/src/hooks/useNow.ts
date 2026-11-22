'use client';

import { useEffect, useState } from 'react';

/**
 * Current time, refreshed every `intervalMs`. Returns `null` until mounted so the
 * server render never disagrees with the client clock (no hydration mismatch).
 */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
