import assert from 'node:assert/strict';
import test from 'node:test';

import { projectPositionFeeCredits } from './fee-credits.js';

const timestamp = new Date('2026-11-23T00:00:00.000Z');

test('replays share changes before and after same-block fee events in transaction order', () => {
  const credits = projectPositionFeeCredits(
    [{ poolId: 'pool', positionId: 1n, binId: 0, shares: 400n }],
    [
      { kind: 'shares', poolId: 'pool', positionId: 2n, bins: [0], shares: [500n], blockNumber: 10n, transactionIndex: 1, logIndex: 5 },
      { kind: 'shares', poolId: 'pool', positionId: 1n, bins: [0], shares: [0n], blockNumber: 10n, transactionIndex: 3, logIndex: 2 },
    ],
    [
      { kind: 'fee', accrualId: 'first', poolId: 'pool', binId: 0, lpFee: 100n, totalShares: 1_000n, tokenIn: 'token', timestamp, blockNumber: 10n, transactionIndex: 2, logIndex: 4 },
      { kind: 'fee', accrualId: 'second', poolId: 'pool', binId: 0, lpFee: 100n, totalShares: 1_000n, tokenIn: 'token', timestamp, blockNumber: 10n, transactionIndex: 4, logIndex: 1 },
    ],
  );

  assert.deepEqual(credits.map(credit => [credit.accrualId, credit.positionId, credit.amountRaw]), [
    ['first', 1n, 40n],
    ['first', 2n, 50n],
    ['second', 2n, 50n],
  ]);
});

test('leaves locked liquidity and integer dust unallocated', () => {
  const credits = projectPositionFeeCredits(
    [{ poolId: 'pool', positionId: 1n, binId: 7, shares: 333n }],
    [],
    [{ kind: 'fee', accrualId: 'fee', poolId: 'pool', binId: 7, lpFee: 10n, totalShares: 1_000n, tokenIn: 'token', timestamp, blockNumber: 1n, transactionIndex: 0, logIndex: 0 }],
  );
  assert.equal(credits[0]?.amountRaw, 3n);
  assert.ok((credits[0]?.amountRaw ?? 0n) <= 10n);
});
