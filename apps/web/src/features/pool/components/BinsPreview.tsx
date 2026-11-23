import { binWeights } from '@/lib/bins';
import type { BinShape } from '@/types/callout';

/** Cap on drawn bars so wide ranges stay legible; the label still shows the real count. */
const MAX_BARS = 48;

interface BinsPreviewProps {
  shape: BinShape;
  bins: number;
  /** Current price position across the range, 0..1. */
  pricePosition: number;
  priceLabel: string;
}

/** Shape preview with the pool price marker and total bin count (brief 8.3). */
export function BinsPreview({ shape, bins, pricePosition, priceLabel }: BinsPreviewProps) {
  const bars = Math.max(1, Math.min(bins, MAX_BARS));
  const activeIndex = Math.max(0, Math.min(bars - 1, Math.round(pricePosition * (bars - 1))));
  const weights = binWeights(shape, bars, activeIndex);

  return (
    <figure className="glass rounded-[2px] p-3">
      <div className="relative flex h-20 items-end gap-px" aria-hidden="true">
        {weights.map((weight, index) => (
          <span
            key={index}
            className={index / bars < pricePosition ? 'flex-1 bg-signal/60' : 'flex-1 bg-fg/30'}
            style={{ height: `${Math.round(weight * 100)}%` }}
          />
        ))}
        <span
          className="absolute inset-y-0 w-px bg-fg"
          style={{ left: `${pricePosition * 100}%` }}
        />
      </div>
      <figcaption className="t-label mt-2 flex justify-between text-muted">
        <span>Pool {priceLabel}</span>
        <span className="text-fg">Total {bins} bins</span>
      </figcaption>
    </figure>
  );
}
