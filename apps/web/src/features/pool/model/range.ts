import type { BinShape } from '@/types/callout';

/** Which tokens a range needs (brief 8.3 side label). */
export type RangeSide = 'quote' | 'base' | 'two-sided';

export interface RangeInput {
  /** Lower bound as % from the current price, e.g. -35. */
  minPct: number;
  /** Upper bound as % from the current price, e.g. 80. */
  maxPct: number;
}

export interface Preset extends RangeInput {
  id: 'buy-the-dip' | 'sell-into-strength' | 'fee-farm';
  label: string;
  shape: BinShape;
  hint: string;
}

// PositionManagerV2 rejects batches larger than 61 bins.
export const RANGE_LIMITS = { minPct: -99, maxPct: 900, maxBins: 61 } as const;

/** Presets from brief 8.3. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'buy-the-dip',
    label: 'Buy the dip',
    shape: 'bid-ask',
    minPct: -35,
    maxPct: -1,
    hint: 'Single-side quote below price',
  },
  {
    id: 'sell-into-strength',
    label: 'Sell into strength',
    shape: 'bid-ask',
    minPct: 2,
    maxPct: 80,
    hint: 'Single-side token above price',
  },
  {
    id: 'fee-farm',
    label: 'Fee farm',
    shape: 'curve',
    minPct: -20,
    maxPct: 20,
    hint: 'Two-sided around price',
  },
];

/**
 * DLMM single-sided rule (brief 9.1): bins below the active bin hold only the
 * quote token, bins above hold only the base token.
 */
export function rangeSide({ minPct, maxPct }: RangeInput): RangeSide {
  if (maxPct <= 0) return 'quote';
  if (minPct >= 0) return 'base';
  return 'two-sided';
}

/** Number of bins spanned by the range for a given bin step. */
export function binCount({ minPct, maxPct }: RangeInput, binStepBps: number): number {
  if (maxPct <= minPct) return 0;
  const step = Math.log(1 + binStepBps / 10_000);
  return Math.max(1, Math.round(Math.log((1 + maxPct / 100) / (1 + minPct / 100)) / step));
}

/** First problem with the range, or null when it is valid. */
export function rangeError(range: RangeInput, binStepBps: number): string | null {
  if (!Number.isFinite(range.minPct) || !Number.isFinite(range.maxPct))
    return 'Enter a min and max';
  if (range.minPct < RANGE_LIMITS.minPct) return `Min cannot be below ${RANGE_LIMITS.minPct}%`;
  if (range.maxPct > RANGE_LIMITS.maxPct) return `Max cannot be above +${RANGE_LIMITS.maxPct}%`;
  if (range.maxPct <= range.minPct) return 'Min must be below max';
  if (binCount(range, binStepBps) > RANGE_LIMITS.maxBins)
    return `Range is wider than ${RANGE_LIMITS.maxBins} bins`;
  return null;
}

export function applyPct(value: number, pct: number): number {
  return value * (1 + pct / 100);
}

function pctToBinOffset(pct: number, binStepBps: number): number {
  return Math.round(Math.log1p(pct / 100) / Math.log1p(binStepBps / 10_000));
}

function binOffsetToPct(offset: number, binStepBps: number): number {
  return (Math.pow(1 + binStepBps / 10_000, offset) - 1) * 100;
}

/**
 * Snaps a manually entered or chart-dragged bound to the pool's bin grid.
 * The opposite handle remains fixed and the resulting inclusive range never
 * exceeds PositionManagerV2's 61-bin batch limit.
 */
export function snapRangeBound(
  range: RangeInput,
  bound: 'minPct' | 'maxPct',
  requestedPct: number,
  binStepBps: number,
): number {
  if (!Number.isFinite(requestedPct) || binStepBps <= 0) return range[bound];
  const lower = pctToBinOffset(range.minPct, binStepBps);
  const upper = pctToBinOffset(range.maxPct, binStepBps);
  const requested = pctToBinOffset(
    Math.min(RANGE_LIMITS.maxPct, Math.max(RANGE_LIMITS.minPct, requestedPct)),
    binStepBps,
  );
  const offset = bound === 'minPct'
    ? Math.min(upper - 1, Math.max(upper - (RANGE_LIMITS.maxBins - 1), requested))
    : Math.max(lower + 1, Math.min(lower + (RANGE_LIMITS.maxBins - 1), requested));
  return Number(binOffsetToPct(offset, binStepBps).toFixed(6));
}

/** Human-readable single-side quote, single-side token, or two-sided label. */
export function sideLabel(side: RangeSide, tokens: { base: string; quote: string }): string {
  if (side === 'quote') return `Single-side ${tokens.quote}`;
  if (side === 'base') return `Single-side ${tokens.base}`;
  return 'Two-sided';
}

/** Where the current price sits across the range, 0 (min) to 1 (max), clamped. */
export function pricePosition({ minPct, maxPct }: RangeInput): number {
  if (maxPct <= minPct) return 0;
  const lower = Math.log(1 + minPct / 100);
  const upper = Math.log(1 + maxPct / 100);
  return Math.min(1, Math.max(0, -lower / (upper - lower)));
}
