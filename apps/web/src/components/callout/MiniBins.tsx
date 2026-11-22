import { binWeights } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { BinShape } from '@/types/callout';

interface MiniBinsProps {
  shape: BinShape;
  count?: number;
  /** Bin index of the current price, highlighted. */
  activeIndex?: number | undefined;
  className?: string;
}

/** Compact bin-shape sparkline used inside callout cards (brief 5.2). */
export function MiniBins({ shape, count = 12, activeIndex, className }: MiniBinsProps) {
  return (
    <span aria-hidden="true" className={cn('flex h-6 items-end gap-0.5', className)}>
      {binWeights(shape, count).map((weight, index) => (
        <span
          key={index}
          className={cn('w-1', index === activeIndex ? 'bg-signal' : 'bg-fg/40')}
          style={{ height: `${Math.round(weight * 100)}%` }}
        />
      ))}
    </span>
  );
}
