import assert from 'node:assert/strict';
import test from 'node:test';

import { toContractAmounts } from './orientation';

test('keeps base and quote aligned when base is token X', () => {
  assert.deepEqual(toContractAmounts(true, '0.1', '25'), { amountX: '0.1', amountY: '25' });
});

test('swaps display amounts back to contract order when base is token Y', () => {
  assert.deepEqual(toContractAmounts(false, '0.1', '25'), { amountX: '25', amountY: '0.1' });
});
