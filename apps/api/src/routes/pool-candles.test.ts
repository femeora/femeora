import assert from 'node:assert/strict';
import test from 'node:test';

import { fillCandleGaps } from './pools.js';

test('fills quiet buckets through the current bucket with previous close', () => {
  const base = {
    open: '2', high: '2', low: '2', close: '2', volumeX: '1', volumeY: '2',
    volumeQuote: '2', swapCount: 1, synthetic: false,
  };
  const candles = fillCandleGaps([{
    ...base, timestamp: '2026-11-23T10:00:00.000Z',
  }, {
    ...base, open: '3', high: '3', low: '3', close: '3', timestamp: '2026-11-23T10:02:00.000Z',
  }], '1m', 10, new Date('2026-11-23T10:04:30.000Z'));

  assert.deepEqual(candles.map(candle => [candle.timestamp, candle.close, candle.swapCount, candle.synthetic]), [
    ['2026-11-23T10:00:00.000Z', '2', 1, false],
    ['2026-11-23T10:01:00.000Z', '2', 0, true],
    ['2026-11-23T10:02:00.000Z', '3', 1, false],
    ['2026-11-23T10:03:00.000Z', '3', 0, true],
    ['2026-11-23T10:04:00.000Z', '3', 0, true],
  ]);
});

test('bounds continuous candles to the requested limit', () => {
  const candles = fillCandleGaps([{
    timestamp: '2026-11-23T10:00:00.000Z', open: '1', high: '1', low: '1', close: '1',
    volumeX: '1', volumeY: '1', volumeQuote: '1', swapCount: 1, synthetic: false,
  }], '1m', 3, new Date('2026-11-23T10:10:00.000Z'));
  assert.equal(candles.length, 3);
  assert.equal(candles[0]!.timestamp, '2026-11-23T10:08:00.000Z');
  assert.equal(candles[2]!.timestamp, '2026-11-23T10:10:00.000Z');
});
