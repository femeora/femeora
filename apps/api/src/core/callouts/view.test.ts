import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeCallout } from './view.js';

const decimal = (scientific: string, fixed: string) => ({
  toString: () => scientific,
  toFixed: () => fixed,
});

test('callout serializer expands small decimals instead of exposing scientific notation', () => {
  const serialized = serializeCallout({
    id: 'c2faf2de-b869-4135-9007-24c06a2c4b47',
    chainId: 4_663,
    positionId: 8n,
    caption: 'Offering DELTA into strength.',
    captionEditedAt: null,
    showSize: true,
    mcAtPost: null,
    priceAtPost: null,
    sizeAtPost: decimal('6.9726964906356e-5', '0.000069726964906356'),
    side: 'around',
    shape: 2,
    lowerBin: 2699,
    upperBin: 2712,
    createdAt: new Date('2026-11-25T07:08:35.223Z'),
    quickExitMinutes: null,
    hasOppositeSide: null,
    isDevOrTopHolder: null,
    isFreshWallet: true,
    user: { id: '3862e79b-148c-4fe3-b430-edcaf1fb0ac5', handle: 'AlbertZero520', name: 'albert', avatarUrl: null, xVerified: false },
    pool: { address: '0xbf8a5a678b7c127bf5b2faa35a6a3c67afe4cf70', type: 'DLMM', tokenX: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', tokenY: '0xe8ffd7e24187f72afb08d75b1bb13088a989a791', quoteToken: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', binStep: 50, initialActiveBin: 2714, activeBin: 2711, referenceCandles: [{ close: decimal('1.339e-2', '0.01339') }] },
    position: {
      owner: '0xb5c0ed0252d1906fca50664eb2198aea0679920b',
      status: 'open',
      depositedQuote: decimal('6.9722184914097e-5', '0.000069722184914097'),
      withdrawnQuote: decimal('0', '0'),
      earnedQuote: decimal('4.779992258e-9', '0.000000004779992258'),
      valueQuote: decimal('6.9726964906356e-5', '0.000069726964906356'),
      inRangeSeconds: 1_660n,
      openSeconds: 1_834n,
    },
    updates: [],
    replies: [],
    _count: { likes: 0, reposts: 0, tails: 0, views: 0 },
  } as never);

  assert.equal(serialized.sizeAtPost, '0.000069726964906356');
  assert.equal(serialized.position.depositedQuote, '0.000069722184914097');
  assert.equal(serialized.position.earnedQuote, '0.000000004779992258');
  assert.equal(serialized.position.valueQuote, '0.000069726964906356');
  assert.equal(serialized.pool.currentPrice, '0.01339');
});
