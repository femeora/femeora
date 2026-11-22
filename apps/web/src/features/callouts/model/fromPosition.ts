import { featuredPool } from '@/features/pool/model/pool';
import type { UserPosition } from '@/features/portfolio/store';
import type { SessionUser } from '@/features/session/store';

import type { Callout } from './callout';

/** A position the signed-in user posted as a callout, in the shared callout shape. */
export function positionToCallout(position: UserPosition, user: SessionUser): Callout | null {
  if (!position.callout) return null;
  const mc = featuredPool.priceUsd * featuredPool.supply;
  return {
    id: position.id,
    caller: {
      handle: user.handle,
      name: user.name,
      initials: user.initials,
      verified: user.verified,
    },
    postedAgo: 'now',
    caption: position.callout.caption || null,
    edited: false,
    pool: {
      base: featuredPool.base,
      quote: featuredPool.quote,
      type: featuredPool.type,
      binStepBps: featuredPool.binStepBps,
      supply: featuredPool.supply,
    },
    shape: position.shape,
    minPct: position.minPct,
    maxPct: position.maxPct,
    sizeUsd: position.depositUsd,
    earnedUsd: 0,
    showSize: position.callout.showSize,
    closed: false,
    inRangePct: 100,
    heldHours: 0,
    tailers: 0,
    likes: 0,
    reposts: 0,
    replies: 0,
    views: 1,
    mcAtPostUsd: mc,
    mcNowUsd: mc,
    quickExitMinutes: null,
    oppositeSide: false,
    updates: [],
    candlesAgo: 0,
  };
}
