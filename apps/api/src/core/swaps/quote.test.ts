import assert from 'node:assert/strict';
import test from 'node:test';

import { quoteDammExactInput, quoteDlmmExactInput } from './quote.js';

test('matches DAMM ceil-fee constant-product exact-input math', () => {
  assert.deepEqual(quoteDammExactInput({
    amountIn: 10_000n,
    reserveIn: 1_000_000n,
    reserveOut: 2_000_000n,
    feePips: 3_000,
  }), { amountOut: 19_743n, totalFee: 30n, binCrossings: 0 });
});

test('consumes DLMM output reserves across bins with Solidity rounding', () => {
  assert.deepEqual(quoteDlmmExactInput({
    amountIn: 1_500n,
    token0ToToken1: true,
    feePips: 0,
    binStepBps: 100,
    decimals0: 18,
    decimals1: 18,
    maximumBinCrossings: 2,
    bins: [
      { binId: 0, reserve0: 0n, reserve1: 1_000n },
      { binId: -1, reserve0: 0n, reserve1: 1_000n },
    ],
  }), { amountOut: 1_495n, totalFee: 0n, binCrossings: 2 });
});

test('rejects a DLMM quote when the crossing cap cannot consume all input', () => {
  assert.throws(() => quoteDlmmExactInput({
    amountIn: 2_000n,
    token0ToToken1: true,
    feePips: 0,
    binStepBps: 100,
    decimals0: 18,
    decimals1: 18,
    maximumBinCrossings: 1,
    bins: [{ binId: 0, reserve0: 0n, reserve1: 1_000n }],
  }), /INSUFFICIENT_LIQUIDITY/);
});

test('normalizes a USDG to WETH quote across 6 and 18 decimals', () => {
  const quote = quoteDlmmExactInput({
    amountIn: 50_000n,
    token0ToToken1: false,
    feePips: 3_000,
    binStepBps: 100,
    decimals0: 18,
    decimals1: 6,
    maximumBinCrossings: 1,
    bins: [{ binId: 746, reserve0: 10n ** 18n, reserve1: 1_000_000n }],
  });

  assert.ok(quote.amountOut > 10_000_000_000_000n, 'must return WETH wei, not a two-digit raw amount');
  assert.ok(quote.amountOut < 100_000_000_000_000n, 'quote remains within the expected 0.00001-0.0001 WETH range');
});
