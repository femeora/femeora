import assert from 'node:assert/strict';
import test from 'node:test';

import type { ApiCallout, ApiCandle, ApiPoolDetail } from '@/lib/api/types';

import { calloutStatus, formatCalloutValue, rangeLabel } from './callout.js';
import { apiCalloutToCallout } from './fromApi.js';

const pool: ApiPoolDetail = {
  id: 'pool-id',
  chainId: 46630,
  address: '0x0000000000000000000000000000000000000010',
  type: 'DLMM',
  tokenX: '0x0000000000000000000000000000000000000001',
  tokenY: '0x0000000000000000000000000000000000000002',
  tokenXDecimals: 18,
  tokenYDecimals: 6,
  tokenXAsset: null,
  tokenYAsset: null,
  quoteToken: '0x0000000000000000000000000000000000000002',
  binStep: 100,
  baseFeePips: 3_000,
  reserveCapX: null,
  reserveCapY: null,
  reserveX: null,
  reserveY: null,
  reserveUpdatedBlock: null,
  initialActiveBin: 0,
  activeBin: 0,
  baseIsTokenX: true,
  createdBlock: '1',
  counts: { positions: 1, swaps: 1, callouts: 1 },
};

const candles: ApiCandle[] = [{
  timestamp: '2026-11-23T11:45:00.000Z',
  open: '0.95',
  high: '1.01',
  low: '0.94',
  close: '1',
  volumeX: '1',
  volumeY: '1',
  swapCount: 1,
}];

const apiCallout: ApiCallout = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'position',
  launchId: null,
  chainId: 46630,
  positionId: '1',
  caption: 'Canonical range',
  captionEditedAt: null,
  showSize: true,
  mcAtPost: null,
  priceAtPost: '0.9',
  sizeAtPost: '10',
  side: 'around',
  shape: 2,
  lowerBin: -1,
  upperBin: 1,
  createdAt: '2026-11-23T11:30:00.000Z',
  score: null,
  antiShill: {
    quickExit: false,
    quickExitMinutes: null,
    hasOppositeSide: true,
    isDevOrTopHolder: null,
    isFreshWallet: null,
    inRangePercentage: 75,
    heldDurationSeconds: '7200',
  },
  user: {
    id: '00000000-0000-4000-8000-000000000002',
    handle: 'canonical_lp',
    name: 'Canonical LP',
    avatarUrl: 'https://pbs.twimg.com/profile_images/canonical.jpg',
    xVerified: true,
  },
  pool: {
    address: pool.address,
    type: 'DLMM',
    tokenX: pool.tokenX,
    tokenY: pool.tokenY,
    quoteToken: pool.quoteToken,
    binStep: pool.binStep,
    initialActiveBin: pool.initialActiveBin,
    activeBin: pool.activeBin,
    currentPrice: '1',
  },
  position: {
    owner: '0x0000000000000000000000000000000000000003',
    status: 'open',
    depositedQuote: '10',
    withdrawnQuote: '0',
    earnedQuote: '1.25',
    valueQuote: '12.5',
    inRangeSeconds: '5400',
    openSeconds: '7200',
  },
  stats: { likes: 2, reposts: 1, replies: 3, quotes: 1, views: 7, tails: 4 },
  viewer: { liked: true, reposted: false, following: true },
  updates: [{
    id: '00000000-0000-4000-8000-000000000003',
    type: 'Added',
    caption: null,
    positionId: '10',
    lowerBin: null,
    upperBin: null,
    transactionHash: `0x${'1'.repeat(64)}`,
    blockNumber: '2',
    timestamp: '2026-11-23T11:40:00.000Z',
    createdAt: '2026-11-23T11:40:00.000Z',
  }],
  comments: [],
};

test('maps canonical API callouts without fabricating USD or unknown integrity signals', () => {
  const callout = apiCalloutToCallout(
    apiCallout,
    pool,
    candles,
    new Date('2026-11-23T12:00:00.000Z'),
  );
  assert.equal(callout.valuation, 'quote');
  assert.equal(callout.caller.avatarUrl, 'https://pbs.twimg.com/profile_images/canonical.jpg');
  assert.deepEqual(callout.rangeBins, { lower: -1, upper: 1, active: 0 });
  assert.deepEqual(rangeLabel(callout), ['Bin -1', 'Bin 1']);
  assert.equal(calloutStatus(callout), 'in-range');
  assert.equal(formatCalloutValue(callout, callout.sizeUsd), '12.5 0x0000…0002');
  assert.equal(callout.isDevOrTopHolder, null);
  assert.equal(callout.isFreshWallet, null);
  assert.equal(callout.oppositeSide, true);
  assert.equal(callout.heldHours, 2);
  assert.equal(callout.quotes, 1);
  assert.equal(callout.views, 7);
  assert.deepEqual(callout.comments, []);
  assert.deepEqual(callout.updates, [{ text: 'Added', ago: '20m' }]);
});
