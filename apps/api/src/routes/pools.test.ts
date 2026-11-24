import assert from 'node:assert/strict';
import test from 'node:test';

import { binQuoteValues, serializePool } from './pools.js';

const tokenX = '0x0000000000000000000000000000000000000001';
const tokenY = '0x0000000000000000000000000000000000000002';
const unit = 10n ** 18n;

test('pool serializer converts every database bigint and decimal to JSON-safe strings', () => {
  const serialized = serializePool({
    id: 'pool-id',
    chainId: 4_663,
    address: tokenX,
    type: 'DLMM',
    tokenX,
    tokenY,
    quoteToken: tokenY,
    binStep: 100,
    baseFeePips: 3_000,
    reserveCapX: { toString: () => '2000000000000000000' },
    reserveCapY: { toString: () => '5000000000' },
    reserveX: { toString: () => '0' },
    reserveY: { toString: () => '0' },
    reserveUpdatedBlock: 121_919_500n,
    createdBlock: 121_919_485n,
  });

  assert.equal(serialized.reserveCapX, '2000000000000000000');
  assert.equal(serialized.reserveCapY, '5000000000');
  assert.equal(serialized.reserveX, '0');
  assert.equal(serialized.reserveY, '0');
  assert.equal(serialized.reserveUpdatedBlock, '121919500');
  assert.equal(serialized.createdBlock, '121919485');
  assert.doesNotThrow(() => JSON.stringify(serialized));
});

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

test('bin display price is independent from differing token decimals', () => {
  const value = binQuoteValues({
    tokenX, tokenY, quoteToken: tokenY,
    tokenXDecimals: 18, tokenYDecimals: 6, binStep: 100, activeBin: 0,
  }, { binId: 0, reserveX: 2n * 10n ** 18n, reserveY: 3n * 10n ** 6n });

  assert.equal(value.priceQuote, '1');
  assert.equal(value.depthQuote, '5');
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
