import { cn } from '@/lib/cn';

type Tone = 'signal' | 'up' | 'down' | 'faint' | 'fg';

const tones: Record<Tone, string> = {
  signal: 'bg-signal',
  up: 'bg-up',
  down: 'bg-down',
  faint: 'bg-faint',
  fg: 'bg-fg',
};

interface StatusDotProps {
  tone?: Tone;
  live?: boolean;
  className?: string;
}

/** 6px indicator dot. Always paired with text, never the only carrier of meaning. */
export function StatusDot({ tone = 'signal', live = false, className }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full align-middle',
        tones[tone],
        live && 'animate-pulse',
        className
      )}
    />
  );
}

export type { Tone as StatusTone };
