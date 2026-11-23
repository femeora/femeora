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

export function filterBySide(callouts: readonly Callout[], side: SideFilter): Callout[] {
  return side === 'all' ? [...callouts] : callouts.filter(callout => calloutSide(callout) === side);
}

/**
 * Best tab: open callouts by fee yield × in-range ratio (brief 7.3), quick exits
 * excluded.
 */
