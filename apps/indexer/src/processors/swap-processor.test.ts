import assert from 'node:assert/strict';
import test from 'node:test';

import { calculatePositionFeeShare } from './swap-processor.js';

test('credits exact floor-rounded pro-rata LP fees without exceeding the bin ledger', () => {
  const attribution = { binId: 7, totalFeeEarned: 1_001n, totalShares: 1_000n };
  const credits = [250n, 333n, 417n].map(shares => calculatePositionFeeShare(attribution, shares));

  assert.deepEqual(credits, [250n, 333n, 417n]);
  assert.ok(credits.reduce((sum, credit) => sum + credit, 0n) <= attribution.totalFeeEarned);
});

test('does not credit empty bins or zero-share positions', () => {
  assert.equal(calculatePositionFeeShare({ binId: 1, totalFeeEarned: 10n, totalShares: 0n }, 5n), 0n);
  assert.equal(calculatePositionFeeShare({ binId: 1, totalFeeEarned: 10n, totalShares: 5n }, 0n), 0n);
});
