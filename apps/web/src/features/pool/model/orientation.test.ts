import assert from 'node:assert/strict';
import test from 'node:test';

import { toContractAmounts, toContractRange } from './orientation';

test('keeps base and quote aligned when base is token X', () => {
  assert.deepEqual(toContractAmounts(true, '0.1', '25'), { amountX: '0.1', amountY: '25' });
});

test('swaps display amounts back to contract order when base is token Y', () => {
  assert.deepEqual(toContractAmounts(false, '0.1', '25'), { amountX: '25', amountY: '0.1' });
});

test('inverts display percentages when base is token Y', () => {
  const range = toContractRange(false, { minPct: -7, maxPct: -1 });
  assert.ok(range.minPct > 1 && range.minPct < 1.1);
  assert.ok(range.maxPct > 7.5 && range.maxPct < 7.6);
});

test('keeps display percentages when base is token X', () => {
  assert.deepEqual(toContractRange(true, { minPct: -7, maxPct: -1 }), { minPct: -7, maxPct: -1 });
});
