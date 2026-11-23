import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateAlwaysInRangeClock, calculateRangeClock } from './range-clock.js';

const at = (seconds: number) => new Date(seconds * 1_000);

test('measures inclusive DLMM range across 1,000 ordered swaps', () => {
  const swaps = Array.from({ length: 1_000 }, (_, index) => ({
    timestamp: at(index + 1),
    activeBinBefore: index % 2 === 0 ? 0 : 2,
    activeBinAfter: index % 2 === 0 ? 2 : 0,
    blockNumber: BigInt(index + 1),
    transactionIndex: 0,
    logIndex: index,
  }));
  const result = calculateRangeClock(
    { openedAt: at(0), closedAt: null, lowerBin: -1, upperBin: 1 },
    0,
    swaps,
    at(1_001),
  );
  assert.deepEqual(result, { inRangeSeconds: 501n, openSeconds: 1_001n });
});

test('applies pre-open swaps, close boundary, same-second ordering, and inclusive bins', () => {
  const result = calculateRangeClock(
    { openedAt: at(10), closedAt: at(30), lowerBin: 1, upperBin: 3 },
    0,
    [
      { timestamp: at(5), activeBinBefore: 0, activeBinAfter: 1, blockNumber: 1n, transactionIndex: 0, logIndex: 0 },
      { timestamp: at(20), activeBinBefore: 1, activeBinAfter: 4, blockNumber: 2n, transactionIndex: 0, logIndex: 0 },
      { timestamp: at(20), activeBinBefore: 4, activeBinAfter: 3, blockNumber: 2n, transactionIndex: 1, logIndex: 0 },
      { timestamp: at(40), activeBinBefore: 3, activeBinAfter: 9, blockNumber: 3n, transactionIndex: 0, logIndex: 0 },
    ],
    at(100),
  );
  assert.deepEqual(result, { inRangeSeconds: 20n, openSeconds: 20n });
});

test('treats DAMM positions as always in range while open', () => {
  assert.deepEqual(calculateAlwaysInRangeClock(at(10), at(25), at(100)), {
    inRangeSeconds: 15n,
    openSeconds: 15n,
  });
});
