import assert from 'node:assert/strict';
import test from 'node:test';

import {
  amountsForShares,
  classifyRangeSide,
  computePositionQuotePerformance,
  convertTokenAmountAtPrice,
  formatCompactUsd,
  formatSubscriptPrice,
  PRICE_SCALE,
  priceFromBinX18,
  quoteAtPrice,
  rawUnitsToDecimal,
  token0Value,
  token1Value,
} from './math.js';

test('matches Solidity BinPriceMath golden vectors exactly', () => {
  assert.equal(priceFromBinX18(0, 25), 1_000_000_000_000_000_000n);
  assert.equal(priceFromBinX18(1, 25), 1_002_500_000_000_000_000n);
  assert.equal(priceFromBinX18(-1, 25), 997_506_234_413_965_087n);
  assert.equal(priceFromBinX18(2, 25), 1_005_006_250_000_000_000n);
  assert.equal(priceFromBinX18(-2, 25), 995_018_687_694_728_266n);
  assert.equal(priceFromBinX18(20, 100), 1_220_190_039_947_966_823n);
});

test('matches Solidity quote and decimal-normalized token1 value rounding', () => {
  const price = priceFromBinX18(1, 25);
  assert.equal(quoteAtPrice(1_000_000n, price, true), 1_002_500n);
  assert.equal(quoteAtPrice(1_002_500n, price, false), 1_000_000n);
  assert.equal(token1Value(2n * 10n ** 18n, 3n * 10n ** 6n, PRICE_SCALE, 18, 6), 5n * 10n ** 6n);
  assert.equal(token0Value(3n * 10n ** 18n, 2n * 10n ** 6n, PRICE_SCALE, 18, 6), 5n * 10n ** 18n);
  assert.equal(convertTokenAmountAtPrice(1n, PRICE_SCALE, true, 18, 6), 0n);
  assert.equal(rawUnitsToDecimal(12_345_678n, 6), '12.345678');
  assert.equal(rawUnitsToDecimal(12_345_678_901_234_567_890n, 20), '0.123456789012345678');
});

test('values shares and position performance with integer accounting', () => {
  assert.equal(classifyRangeSide(-5, -1, 0), 'below');
  assert.equal(classifyRangeSide(1, 5, 0), 'above');
  assert.equal(classifyRangeSide(-1, 1, 0), 'around');
  assert.deepEqual(amountsForShares(25n, 1_000n, 2_000n, 100n), { amount0: 250n, amount1: 500n });
  assert.deepEqual(
    computePositionQuotePerformance({
      valueQuote: 1_150n,
      withdrawnQuote: 100n,
      depositedQuote: 1_000n,
      earnedQuote: 75n,
    }),
    { profitQuote: 250n, earnedQuote: 75n, roiBps: 2_500n },
  );
});

test('formats compact USD and subscript-zero prices in the shared SDK', () => {
  assert.equal(formatCompactUsd(1_250_000), '$1.25M');
  assert.equal(formatCompactUsd(-1_250), '$-1.25K');
  assert.equal(formatSubscriptPrice(0.00004893), '$0.0₄4893');
  assert.equal(formatSubscriptPrice(1.25), '$1.2500');
});

test('rejects invalid bin, decimal, price, and zero-value inputs', () => {
  assert.throws(() => priceFromBinX18(10_001, 25), RangeError);
  assert.throws(() => priceFromBinX18(0, 0), RangeError);
  assert.throws(() => token1Value(1n, 0n, PRICE_SCALE, 37, 18), RangeError);
  assert.throws(() => token1Value(0n, 0n, PRICE_SCALE, 18, 18), RangeError);
  assert.throws(() => formatSubscriptPrice(-1), RangeError);
});
