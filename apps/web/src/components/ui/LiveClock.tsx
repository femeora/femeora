'use client';

import { useNow } from '@/hooks/useNow';
import { formatClock, formatUtcOffset } from '@/lib/time';

interface LiveClockProps {
  showZone?: boolean;
  className?: string;
}

/** Viewer's local time. Renders a fixed-width placeholder until mounted. */
export function LiveClock({ showZone = true, className }: LiveClockProps) {
  const now = useNow();

  return (
    <span className={className}>
      <time
        className="inline-block min-w-[8ch] text-fg"
        dateTime={now?.toISOString()}
        suppressHydrationWarning
      >
        {now ? formatClock(now) : '--:--:--'}
      </time>
      {showZone && now ? <span className="ml-2 text-faint">{formatUtcOffset(now)}</span> : null}
    </span>
  );
}
