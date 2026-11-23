import assert from 'node:assert/strict';
import test from 'node:test';

import { PRICE_SCALE } from '@fomeora/sdk';

import { calculateDammPositionQuote, calculateDlmmPositionQuote } from './position-value.js';

test('values a multi-bin DLMM position in either configured quote token', () => {
  const bins = [
    { shares: 50n, reserve0: 1_000_000n, reserve1: 2_000_000n, totalShares: 100n, priceX18: 2n * PRICE_SCALE },
    { shares: 25n, reserve0: 400_000n, reserve1: 800_000n, totalShares: 100n, priceX18: 2n * PRICE_SCALE },
  ];
  assert.equal(
    calculateDlmmPositionQuote(bins, { quoteIsToken0: false, decimals0: 6, decimals1: 6 }),
    '2.4',
  );
  assert.equal(
    calculateDlmmPositionQuote(bins, { quoteIsToken0: true, decimals0: 6, decimals1: 6 }),
    '1.2',
  );
});

test('values DAMM shares from exact reserve ratios and floors ownership amounts', () => {
  assert.equal(
    calculateDammPositionQuote(
      25n,
      1_000_000n,
      2_000_000n,
      100n,
      { quoteIsToken0: false, decimals0: 6, decimals1: 6 },
    ),
    '1',
  );
});

test('returns zero for empty ownership without inventing value', () => {
  assert.equal(
    calculateDammPositionQuote(
      0n,
      1_000_000n,
      2_000_000n,
      100n,
      { quoteIsToken0: true, decimals0: 6, decimals1: 6 },
    ),
    '0',
  );
});
