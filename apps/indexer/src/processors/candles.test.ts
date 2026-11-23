import assert from 'node:assert/strict';
import test from 'node:test';

import { candleBucketKey, projectCandles } from './candles.js';

const pool = {
  tokenX: '0x0000000000000000000000000000000000000001',
  tokenY: '0x0000000000000000000000000000000000000002',
  tokenXDecimals: 18,
  tokenYDecimals: 6,
};

test('builds all six UTC buckets with normalized OHLC and directional raw volumes', () => {
  const timestamp = new Date('2026-11-23T10:07:31.000Z');
  const candles = projectCandles([
    {
      timestamp,
      blockNumber: 2n,
      transactionIndex: 0,
      logIndex: 2,
      tokenIn: pool.tokenY,
      amountIn: '6000000',
      amountOut: '2000000000000000000',
    },
    {
      timestamp,
      blockNumber: 1n,
      transactionIndex: 1,
      logIndex: 3,
      tokenIn: pool.tokenX,
      amountIn: '1000000000000000000',
      amountOut: '2000000',
    },
    {
      timestamp,
      blockNumber: 1n,
      transactionIndex: 0,
      logIndex: 5,
      tokenIn: pool.tokenX,
      amountIn: '1000000000000000000',
      amountOut: '4000000',
    },
  ], pool);

  assert.equal(candles.length, 6);
  const oneMinute = candles.find(candle => candle.interval === '1m');
  assert.deepEqual(oneMinute, {
    interval: '1m',
    bucketStart: new Date('2026-11-23T10:07:00.000Z'),
    open: '4',
    high: '4',
    low: '2',
    close: '3',
    volumeX: '4000000000000000000',
    volumeY: '12000000',
    swapCount: 3,
  });
  assert.equal(candleBucketKey('1d', timestamp), '1d:2026-11-23T00:00:00.000Z');
});

test('drops invalid token metadata instead of fabricating a candle', () => {
  assert.deepEqual(projectCandles([{
    timestamp: new Date(),
    blockNumber: 1n,
    transactionIndex: 0,
    logIndex: 0,
    tokenIn: pool.tokenX,
    amountIn: '1',
    amountOut: '1',
  }], { ...pool, tokenYDecimals: null }), []);
});
