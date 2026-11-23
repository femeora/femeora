import assert from 'node:assert/strict';
import test from 'node:test';

import { binQuoteValues } from './pools.js';

const tokenX = '0x0000000000000000000000000000000000000001';
const tokenY = '0x0000000000000000000000000000000000000002';
const unit = 10n ** 18n;

test('bin quote depth values both sides when token Y is quote', () => {
  const pool = {
    tokenX, tokenY, quoteToken: tokenY,
    tokenXDecimals: 18, tokenYDecimals: 18, binStep: 100, activeBin: 0,
  };
  const below = binQuoteValues(pool, { binId: -1, reserveX: 0n, reserveY: 3n * unit });
  const active = binQuoteValues(pool, { binId: 0, reserveX: 2n * unit, reserveY: 3n * unit });
  const above = binQuoteValues(pool, { binId: 1, reserveX: 2n * unit, reserveY: 0n });

  assert.deepEqual(below, { priceQuote: '0.990099009900990099', depthQuote: '3', side: 'quote' });
  assert.deepEqual(active, { priceQuote: '1', depthQuote: '5', side: 'active' });
  assert.deepEqual(above, { priceQuote: '1.01', depthQuote: '2.02', side: 'base' });
});

test('bin quote depth is inverted when token X is quote', () => {
  const value = binQuoteValues({
    tokenX, tokenY, quoteToken: tokenX,
    tokenXDecimals: 18, tokenYDecimals: 18, binStep: 100, activeBin: 0,
  }, { binId: 1, reserveX: 2n * unit, reserveY: 3n * unit });

  assert.equal(value.side, 'base');
  assert.equal(value.priceQuote, '0.990099009900990099');
  assert.equal(value.depthQuote, '4.970297029702970297');
});

test('bin quote values are unavailable without canonical quote metadata', () => {
  assert.deepEqual(binQuoteValues({
    tokenX, tokenY, quoteToken: null,
    tokenXDecimals: null, tokenYDecimals: null, binStep: 100, activeBin: 0,
  }, { binId: 0, reserveX: unit, reserveY: unit }), {
    priceQuote: null, depthQuote: null, side: 'active',
  });
});
