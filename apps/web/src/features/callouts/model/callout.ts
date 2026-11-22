import { formatCompactUsd } from '@/features/pool/model/format';
import { binCount, rangeSide, type RangeSide } from '@/features/pool/model/range';
import type { BinShape, RangeStatus, Span } from '@/types/callout';

/** Identity from Sign in with X (brief 4.1). */
export interface Caller {
  handle: string;
  name: string;
  initials: string;
  verified: boolean;
}

/** Auto-generated thread row from a position event (brief 5.3). */
export interface CalloutUpdate {
  text: string;
  ago: string;
}

/**
 * A callout: one post attached to one on-chain position (brief 5). Numbers are the
 * shape of `GET /v1/callouts/:id`; display strings are derived, never stored.
 */
export interface Callout {
  id: string;
  caller: Caller;
  postedAgo: string;
  caption: string | null;
  edited: boolean;
  pool: { base: string; quote: string; type: 'DLMM' | 'DAMM'; binStepBps: number; supply: number };
  shape: BinShape;
  /** Range as % from the market cap at post time. */
  minPct: number;
  maxPct: number;
  sizeUsd: number;
  earnedUsd: number;
  showSize: boolean;
  /** Position fully withdrawn. */
  closed: boolean;
  inRangePct: number;
  heldHours: number;
  tailers: number;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  mcAtPostUsd: number;
  mcNowUsd: number;
  /** Minutes between posting and removing 50%+, when that happened within 30 min. */
  quickExitMinutes: number | null;
  /** Caller also holds liquidity on the other side of price (brief 13.1). */
  oppositeSide: boolean;
  updates: readonly CalloutUpdate[];
  /** Chart placement: candles back from the latest. */
  candlesAgo: number;
}

/** Lower and upper market cap of the range in USD. */
export function rangeMc(callout: Callout): [number, number] {
  return [
    callout.mcAtPostUsd * (1 + callout.minPct / 100),
    callout.mcAtPostUsd * (1 + callout.maxPct / 100),
  ];
}

/** Live status dot (brief 5.2): closed, or whether the current market cap sits in the range. */
export function calloutStatus(callout: Callout): RangeStatus {
  if (callout.closed) return 'closed';
  if (callout.pool.type === 'DAMM') return 'in-range';
  const [low, high] = rangeMc(callout);
  return callout.mcNowUsd >= low && callout.mcNowUsd <= high ? 'in-range' : 'out-of-range';
}

export function calloutSide(callout: Callout): RangeSide {
  return rangeSide(callout);
}

export function sideLabel(callout: Callout): string {
  const side = calloutSide(callout);
  if (side === 'quote') return `Single-side ${callout.pool.quote}`;
  if (side === 'base') return `Single-side ${callout.pool.base}`;
  return 'Two-sided';
}

/** `$3.18M → $4.84M MC` for DLMM, `Full range` for DAMM. */
export function rangeLabel(callout: Callout): Span {
  if (callout.pool.type === 'DAMM') return 'Full range';
  const [low, high] = rangeMc(callout);
  return [formatCompactUsd(low), `${formatCompactUsd(high)} MC`];
}

export function calloutBins(callout: Callout): number {
  return binCount(callout, callout.pool.binStepBps);
}

export function heldLabel(hours: number): string {
  return hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

export function compactCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(value);
}

export type TailMode = 'same-range' | 'same-shape-now';

/**
 * Range a tail would open, as % from the current market cap (brief 6.1):
 * the caller's exact bins, or the same shape re-anchored to the active bin.
 */
export function tailRange(callout: Callout, mode: TailMode): { minPct: number; maxPct: number } {
  if (mode === 'same-shape-now') return { minPct: callout.minPct, maxPct: callout.maxPct };
  const shift = (pct: number) =>
    ((callout.mcAtPostUsd * (1 + pct / 100)) / callout.mcNowUsd - 1) * 100;
  return { minPct: shift(callout.minPct), maxPct: shift(callout.maxPct) };
}
