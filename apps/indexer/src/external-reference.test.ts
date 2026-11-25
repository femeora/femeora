import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateExternalCandles,
  geckoReferenceCurrency,
  parseGeckoCandles,
} from './external-reference.js';

const delta = '0xe8ffd7e24187f72afb08d75b1bb13088a989a791';

test('requests USD candles for USDG references and token candles for WETH references', () => {
  assert.equal(geckoReferenceCurrency('USD'), 'usd');
  assert.equal(geckoReferenceCurrency('WETH'), 'token');
});

test('parses GeckoTerminal candles only for the configured base token', () => {
  const candles = parseGeckoCandles(
    {
      data: {
        attributes: {
          ohlcv_list: [[1_795_575_600, 0.0000013, 0.0000014, 0.0000012, 0.00000135, 1]],
        },
      },
      meta: {
        base: { address: delta },
        quote: { address: '0x0bd7d308f8e1639fab988df18a8011f41eacad73' },
      },
    },
    delta
  );
  assert.deepEqual(candles, [
    {
      timestamp: 1_795_575_600_000,
      open: '0.0000013',
      high: '0.0000014',
      low: '0.0000012',
      close: '0.00000135',
    },
  ]);
  assert.throws(
    () =>
      parseGeckoCandles(
        {
          data: { attributes: { ohlcv_list: [] } },
          meta: { base: { address: '0x0000000000000000000000000000000000000001' } },
        },
        delta
      ),
    /EXTERNAL_REFERENCE_PAIR_MISMATCH/
  );
});

test('aggregates five-minute reference candles without inventing volume', () => {
  const start = 1_795_575_600_000;
  const aggregated = aggregateExternalCandles([
    { timestamp: start, open: '1', high: '2', low: '0.9', close: '1.5' },
    { timestamp: start + 300_000, open: '1.5', high: '3', low: '1.4', close: '2.5' },
    { timestamp: start + 600_000, open: '2.5', high: '2.7', low: '2', close: '2.2' },
  ]);
  const fifteen = aggregated.find(candle => candle.interval === '15m');
  assert.deepEqual(fifteen, {
    interval: '15m',
    timestamp: Math.floor(start / 900_000) * 900_000,
    open: '1',
    high: '3',
    low: '0.9',
    close: '2.2',
  });
  assert.equal('volume' in fifteen!, false);
});
