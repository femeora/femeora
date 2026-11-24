import assert from 'node:assert/strict';
import test from 'node:test';

import { pairPriceX18 } from './reference-prices.js';

test('normalizes two Chainlink USD feeds into quote per base at 18 decimals', () => {
  assert.equal(pairPriceX18(2500_00000000n, 8, 1_00000000n, 8), 2500n * 10n ** 18n);
});

test('normalizes feeds with different decimal precision', () => {
  assert.equal(pairPriceX18(25_00000000n, 8, 2_500000000000000000n, 18), 10n * 10n ** 18n);
});

test('rejects non-positive oracle answers', () => {
  assert.throws(() => pairPriceX18(0n, 8, 1n, 8), /REFERENCE_PRICE_INVALID/);
});
