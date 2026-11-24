import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoricalReferenceCandles, pairPriceX18 } from './reference-prices.js';

test('normalizes two Chainlink USD feeds into quote per base at 18 decimals', () => {
  assert.equal(pairPriceX18(2500_00000000n, 8, 1_00000000n, 8), 2500n * 10n ** 18n);
});

test('normalizes feeds with different decimal precision', () => {
  assert.equal(pairPriceX18(25_00000000n, 8, 2_500000000000000000n, 18), 10n * 10n ** 18n);
});

test('rejects non-positive oracle answers', () => {
  assert.throws(() => pairPriceX18(0n, 8, 1n, 8), /REFERENCE_PRICE_INVALID/);
});

test('builds historical OHLC values only inside the requested range', () => {
  const from = new Date('2026-11-01T00:00:00.000Z');
  const to = new Date('2026-11-01T00:02:00.000Z');
  const candles = buildHistoricalReferenceCandles(
    [
      { answer: 9_00000000n, updatedAt: new Date('2026-10-31T23:59:00.000Z') },
      { answer: 10_00000000n, updatedAt: new Date('2026-11-01T00:00:10.000Z') },
      { answer: 8_00000000n, updatedAt: new Date('2026-11-01T00:00:40.000Z') },
      { answer: 11_00000000n, updatedAt: new Date('2026-11-01T00:01:10.000Z') },
    ],
    8,
    [{ answer: 1_00000000n, updatedAt: new Date('2026-10-31T23:58:00.000Z') }],
    8,
    from,
    to,
  );
  const oneMinute = candles.filter(candle => candle.interval === '1m');
  assert.equal(oneMinute.length, 2);
  assert.deepEqual(
    { open: oneMinute[0]?.open, high: oneMinute[0]?.high, low: oneMinute[0]?.low, close: oneMinute[0]?.close },
    { open: '10', high: '10', low: '8', close: '8' },
  );
  assert.deepEqual(
    { open: oneMinute[1]?.open, high: oneMinute[1]?.high, low: oneMinute[1]?.low, close: oneMinute[1]?.close },
    { open: '11', high: '11', low: '11', close: '11' },
  );
});
