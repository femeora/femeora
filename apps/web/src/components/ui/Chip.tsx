import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type ChipTone = 'neutral' | 'signal' | 'up' | 'down';

const tones: Record<ChipTone, string> = {
  neutral: 'border-line text-muted',
  signal: 'border-signal/40 text-signal',
  up: 'border-up/40 text-up',
  down: 'border-down/50 text-down',
};

/** Small mono label with a hairline border, for callout attributes and badges. */
export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        't-label inline-flex items-center gap-1.5 rounded-[2px] border bg-fg/[0.03] px-1.5 py-0.5',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
