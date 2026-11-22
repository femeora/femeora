import { calloutSide, type Callout } from '@/features/callouts/model/callout';

/** Feed tabs and filters (brief 7.1). The list itself maps to `GET /v1/feed?tab=`. */
export type FeedTab = 'callouts' | 'following' | 'best';
export type SideFilter = 'all' | 'quote' | 'base' | 'two-sided';

export const SIDE_FILTERS: readonly { value: SideFilter; label: string }[] = [
  { value: 'all', label: 'All sides' },
  { value: 'quote', label: 'Single-side quote' },
  { value: 'base', label: 'Single-side token' },
  { value: 'two-sided', label: 'Two-sided' },
];

export const trendingPools = [
  { pair: 'HOODIE / USDG', callouts24h: 38, change: '+12.4%' },
  { pair: 'ROBIN / USDG', callouts24h: 21, change: '+3.1%' },
  { pair: 'FEATHER / USDG', callouts24h: 9, change: '-4.8%' },
] as const;

export const topCallers = [
  { handle: '@binbaron', earned: '$1.90K', inRange: '96%' },
  { handle: '@lpwizard', earned: '$812', inRange: '88%' },
  { handle: '@quietquote', earned: '$301', inRange: '91%' },
] as const;

export function filterBySide(callouts: readonly Callout[], side: SideFilter): Callout[] {
  return side === 'all' ? [...callouts] : callouts.filter(callout => calloutSide(callout) === side);
}

/**
 * Best tab: open callouts by fee yield × in-range ratio (brief 7.3), quick exits
 * excluded.
 */
export function bestCallouts(callouts: readonly Callout[]): Callout[] {
  const score = (callout: Callout) =>
    (callout.earnedUsd / Math.max(callout.sizeUsd, 50)) *
    (callout.inRangePct / 100) *
    (1 + Math.log10(1 + callout.tailers));
  return callouts
    .filter(callout => !callout.closed && callout.quickExitMinutes === null)
    .sort((a, b) => score(b) - score(a));
}
