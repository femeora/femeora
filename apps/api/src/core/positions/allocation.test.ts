import assert from 'node:assert/strict';
import test from 'node:test';

import { shapeWeights } from '@fomeora/sdk';

import {
  allocateRangeAmounts,
  distributeAmount,
  minimumShares,
  rangeBins,
} from './allocation.js';

test('distributeAmount conserves every raw unit for all shapes', () => {
  for (const shape of ['spot', 'curve', 'bid-ask'] as const) {
    const amounts = distributeAmount(101n, 5, shape);
    assert.equal(amounts.reduce((sum, amount) => sum + amount, 0n), 101n);
    assert.ok(amounts.every(amount => amount > 0n));
  }
});

test('curve is center-heavy and bid-ask is edge-heavy', () => {
  const curve = distributeAmount(1_000n, 5, 'curve');
  const bidAsk = distributeAmount(1_000n, 5, 'bid-ask');
  assert.ok(curve[2]! > curve[0]!);
  assert.ok(bidAsk[0]! > bidAsk[2]!);
});

test('rangeBins converts percentage bounds and enforces contract maximum', () => {
  assert.deepEqual(rangeBins(0, -1, 1, 100), [-1, 0, 1]);
  assert.throws(() => rangeBins(0, -50, 50, 10), /TOO_MANY_BINS/);
});

test('range allocation obeys DLMM token sides and conserves both totals', () => {
  const result = allocateRangeAmounts({
    bins: [-2, -1, 0, 1, 2], activeBin: 0, amount0: 90n, amount1: 40n, shape: 'spot',
  });
  assert.deepEqual(result.amounts0.slice(0, 2), [0n, 0n]);
  assert.deepEqual(result.amounts1.slice(2), [0n, 0n, 0n]);
  assert.equal(result.amounts0.reduce((sum, amount) => sum + amount, 0n), 90n);
  assert.equal(result.amounts1.reduce((sum, amount) => sum + amount, 0n), 40n);
});

test('preview weights and server allocation agree across 20 ranges', () => {
  for (let sample = 0; sample < 20; sample += 1) {
    const lower = -(2 + sample % 9);
    const upper = 2 + (sample * 3) % 9;
    const bins = Array.from({ length: upper - lower + 1 }, (_, index) => lower + index);
    const shape = (['spot', 'curve', 'bid-ask'] as const)[sample % 3]!;
    const result = allocateRangeAmounts({ bins, activeBin: 0, amount0: 1_000_000_000_000n, amount1: 1_000_000_000_000n, shape });
    const expected = new Map(shapeWeights({ lowerBin: lower, upperBin: upper, activeBin: 0, shape }).map(item => [item.bin, Number(item.weight)]));
    for (const side of [bins.filter(bin => bin < 0), bins.filter(bin => bin >= 0)]) {
      const amounts = side.map(bin => Number(bin < 0 ? result.amounts1[bins.indexOf(bin)] : result.amounts0[bins.indexOf(bin)]));
      const expectedTotal = side.reduce((sum, bin) => sum + (expected.get(bin) ?? 0), 0);
      side.forEach((bin, index) => {
        const actualRatio = amounts[index]! / amounts.reduce((sum, amount) => sum + amount, 0);
        const expectedRatio = (expected.get(bin) ?? 0) / expectedTotal;
        assert.ok(Math.abs(actualRatio - expectedRatio) < 0.001);
      });
    }
  }
});

test('minimumShares mirrors new and initialized bin math with slippage', () => {
  assert.equal(minimumShares({
    bin: { binId: 0, reserve0: 0n, reserve1: 0n, totalShares: 0n },
    amount0: 0n, amount1: 11_000n, binStepBps: 100, decimals0: 6, decimals1: 6, slippageBps: 100,
  }), 9_900n);
  assert.equal(minimumShares({
    bin: { binId: 0, reserve0: 0n, reserve1: 10_000n, totalShares: 5_000n },
    amount0: 0n, amount1: 2_000n, binStepBps: 100, decimals0: 6, decimals1: 6, slippageBps: 50,
  }), 995n);
});
