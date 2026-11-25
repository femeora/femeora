import assert from 'node:assert/strict';
import test from 'node:test';

import { serializePosition } from './positions.js';

test('position serializer converts nested pool bigint values to JSON-safe strings', () => {
  const serialized = serializePosition({
    id: 1n, chainId: 4_663, poolId: '0f4a21af-2ac6-4745-ade1-c8a2f1d1b041',
    owner: '0xb5c0ed0252d1906fca50664eb2198aea0679920b', lowerBin: 703, upperBin: 744,
    shape: 2, tag: null, referrer: null, status: 'open',
    depositedQuote: { toString: () => '0.3' }, withdrawnQuote: { toString: () => '0' },
    earnedQuote: { toString: () => '4.779992258e-9', toFixed: () => '0.000000004779992258' }, valueQuote: null, valueQuoteUpdatedAt: null,
    valueQuoteBlock: null, inRangeSeconds: 0n, openSeconds: 60n,
    openedAt: new Date('2026-11-24T06:50:00.000Z'), closedAt: null, canonical: true,
    bins: [{ binId: 703, shares: { toString: () => '13997' } }], callouts: [],
    pool: {
      id: '0f4a21af-2ac6-4745-ade1-c8a2f1d1b041', chainId: 4_663,
      address: '0xbc826ccb7e644e017c1d21478b4e55d49d2b2dad', type: 'DLMM',
      tokenX: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
      tokenY: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', tokenXDecimals: 18,
      tokenYDecimals: 6, quoteToken: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
      binStep: 100, baseFeePips: 3_000,
      reserveCapX: { toString: () => '2000000000000000000' },
      reserveCapY: { toString: () => '5000000000' }, reserveX: { toString: () => '0' },
      reserveY: { toString: () => '300000' }, reserveUpdatedBlock: 122039000n,
      lastReserveRefreshAt: new Date('2026-11-24T06:58:00.000Z'), initialActiveBin: 746,
      activeBin: 746, lastValueRefreshAt: null, createdBlock: 121919485n, canonical: true,
    },
  } as never);

  assert.equal(serialized?.pool.reserveUpdatedBlock, '122039000');
  assert.equal(serialized?.pool.createdBlock, '121919485');
  assert.equal(serialized?.poolCanonical, true);
  assert.equal(serialized?.replacementPoolAddress, null);
  assert.equal(serialized?.earnedQuote, '0.000000004779992258');
  assert.doesNotThrow(() => JSON.stringify(serialized));
});
