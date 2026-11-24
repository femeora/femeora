import assert from 'node:assert/strict';
import test from 'node:test';

import { activeBinPrice, apiPoolToPool } from './live';

import type { ApiPoolDetail } from '@/lib/api/types';

const pool: ApiPoolDetail = {
  id: '0f4a21af-2ac6-4745-ade1-c8a2f1d1b041',
  chainId: 4_663,
  address: '0xbc826ccb7e644e017c1d21478b4e55d49d2b2dad',
  type: 'DLMM',
  tokenX: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
  tokenY: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
  tokenXDecimals: 18,
  tokenYDecimals: 6,
  quoteToken: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
  binStep: 100,
  baseFeePips: 3_000,
  reserveCapX: '2000000000000000000',
  reserveCapY: '5000000000',
  reserveX: '0',
  reserveY: '0',
  reserveUpdatedBlock: '122025318',
  initialActiveBin: 746,
  activeBin: 746,
  baseIsTokenX: true,
  createdBlock: '121919485',
  counts: { positions: 0, swaps: 0, callouts: 0 },
};

test('uses the canonical active-bin price before the first candle', () => {
  const price = activeBinPrice(pool);
  assert.ok(price > 1_600 && price < 1_800);
  assert.equal(apiPoolToPool(pool, undefined).priceUsd, price);
});

test('prefers a positive indexed candle over the bootstrap price', () => {
  const mapped = apiPoolToPool(pool, {
    timestamp: '2026-11-24T00:00:00.000Z',
    open: '1700', high: '1710', low: '1690', close: '1705',
    volumeX: '0', volumeY: '0', volumeQuote: '0', swapCount: 1,
  });
  assert.equal(mapped.priceUsd, 1705);
});
