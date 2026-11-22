/** Shared callout domain types used by the landing page and the app. */

export type BinShape = 'spot' | 'curve' | 'bid-ask';
export type RangeStatus = 'in-range' | 'out-of-range' | 'closed';

/** A plain value, or a from/to pair rendered with an arrow icon (see `SpanText`). */
export type Span = string | readonly [from: string, to: string];

export interface SampleCallout {
  title: string;
  token: string;
  pool: 'DLMM' | 'DAMM';
  shape: BinShape;
  side: string;
  range: Span;
  bins: string;
  status: RangeStatus;
  inRange: string;
  position: string;
  earned: string;
  tailers: number;
  meta: readonly Span[];
}
