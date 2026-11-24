import { priceFromBinX18 } from '@fomeora/sdk';

import type { ApiCallout, ApiCandle, ApiPoolDetail } from '@/lib/api/types';
import { tokenSymbol } from '@/lib/tokens';
import type { BinShape } from '@/types/callout';

import type { Callout } from './callout';

function number(value: string | null, fallback = 0): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shape(value: number): BinShape {
  if (value === 1) return 'curve';
  if (value === 2) return 'bid-ask';
  return 'spot';
}

function elapsedLabel(timestamp: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function percentFromActive(bin: number, active: number, step: number): number {
  try {
    const price = Number(priceFromBinX18(bin, step));
    const activePrice = Number(priceFromBinX18(active, step));
    return activePrice === 0 ? 0 : (price / activePrice - 1) * 100;
  } catch {
    return 0;
  }
}

function candleDistance(createdAt: string, candles: readonly ApiCandle[]): number {
  if (candles.length === 0) return 0;
  const created = new Date(createdAt).getTime();
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  candles.forEach((candle, index) => {
    const candidate = Math.abs(new Date(candle.timestamp).getTime() - created);
    if (candidate < distance) {
      distance = candidate;
      closest = index;
    }
  });
  return Math.max(0, candles.length - 1 - closest);
}

export function apiCalloutToCallout(
  callout: ApiCallout,
  pool: Pick<ApiPoolDetail, 'activeBin' | 'binStep' | 'quoteToken' | 'tokenX' | 'tokenY' | 'type'>,
  candles: readonly ApiCandle[],
  now = new Date(),
): Callout {
  const active = pool.activeBin ?? 0;
  const currentPrice = number(candles.at(-1)?.close ?? null, number(callout.priceAtPost, 0));
  const priceAtPost = number(callout.priceAtPost, currentPrice);
  const lowerPct = pool.type === 'DAMM' ? -100 : percentFromActive(callout.lowerBin, active, pool.binStep);
  const upperPct = pool.type === 'DAMM' ? 100 : percentFromActive(callout.upperBin, active, pool.binStep);
  const handle = callout.user.handle.replace(/^@/, '');
  const quoteAddress = pool.quoteToken ?? pool.tokenY;
  const baseAddress = quoteAddress.toLowerCase() === pool.tokenX.toLowerCase()
    ? pool.tokenY
    : pool.tokenX;
  const initials = (callout.user.name ?? handle)
    .split(/\s+/)
    .map(part => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return {
    id: callout.id,
    caller: {
      handle,
      name: callout.user.name ?? handle,
      initials,
      verified: callout.user.xVerified,
    },
    postedAgo: elapsedLabel(callout.createdAt, now),
    caption: callout.caption,
    edited: callout.captionEditedAt !== null,
    pool: {
      base: tokenSymbol(baseAddress),
      quote: tokenSymbol(quoteAddress),
      baseAddress,
      quoteAddress,
      tokenX: pool.tokenX,
      tokenY: pool.tokenY,
      type: pool.type,
      binStepBps: pool.binStep,
      supply: 1,
    },
    shape: shape(callout.shape),
    minPct: Math.min(lowerPct, upperPct),
    maxPct: Math.max(lowerPct, upperPct),
    sizeUsd: number(callout.position.valueQuote, number(callout.sizeAtPost)),
    earnedUsd: number(callout.position.earnedQuote),
    showSize: callout.showSize,
    closed: callout.position.status === 'closed',
    inRangePct: callout.antiShill.inRangePercentage,
    heldHours: number(callout.antiShill.heldDurationSeconds) / 3_600,
    tailers: callout.stats.tails,
    likes: callout.stats.likes,
    reposts: callout.stats.reposts,
    replies: callout.stats.replies,
    viewer: callout.viewer,
    views: 0,
    mcAtPostUsd: priceAtPost,
    mcNowUsd: currentPrice,
    quickExitMinutes: callout.antiShill.quickExitMinutes,
    oppositeSide: callout.antiShill.hasOppositeSide,
    valuation: 'quote',
    rangeBins: { lower: callout.lowerBin, upper: callout.upperBin, active },
    isDevOrTopHolder: callout.antiShill.isDevOrTopHolder,
    isFreshWallet: callout.antiShill.isFreshWallet,
    updates: callout.updates.map(update => ({
      text: update.caption ?? update.type,
      ago: elapsedLabel(update.timestamp, now),
    })),
    candlesAgo: candleDistance(callout.createdAt, candles),
  };
}

export function apiFeedCalloutToCallout(callout: ApiCallout, now = new Date()): Callout {
  return apiCalloutToCallout(callout, {
    activeBin: callout.pool.activeBin,
    binStep: callout.pool.binStep,
    quoteToken: callout.pool.quoteToken,
    tokenX: callout.pool.tokenX,
    tokenY: callout.pool.tokenY,
    type: callout.pool.type,
  }, [], now);
}
