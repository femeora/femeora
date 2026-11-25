import { Prisma } from '@fomeora/database';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddress } from 'viem';

import { orientPoolPrice } from './pool-creation.js';

const tokenX = getAddress('0x0000000000000000000000000000000000000001');
const tokenY = getAddress('0x0000000000000000000000000000000000000002');
const pool = {
  id: 'pool', address: '0x0000000000000000000000000000000000000003', type: 'DLMM',
  tokenX: tokenX.toLowerCase(), tokenY: tokenY.toLowerCase(), quoteToken: tokenY.toLowerCase(),
  binStep: 25, baseFeePips: 3_000,
};

test('orients an indexed quote/base price as token B per token A', () => {
  assert.equal(orientPoolPrice(new Prisma.Decimal('2.5'), pool, tokenX, tokenY), '2.5');
});

test('inverts the indexed price when the requested token order is reversed', () => {
  assert.equal(orientPoolPrice(new Prisma.Decimal('2.5'), pool, tokenY, tokenX), '0.4');
});

test('does not guess a price when the pool has no declared quote token', () => {
  assert.equal(orientPoolPrice(new Prisma.Decimal('2.5'), { ...pool, quoteToken: null }, tokenX, tokenY), null);
});
