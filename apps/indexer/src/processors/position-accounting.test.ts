import assert from 'node:assert/strict';
import test from 'node:test';

import { positionCashFlowFromPayload } from './position-accounting.js';

const pool = {
  tokenX: '0x0000000000000000000000000000000000000001',
  tokenY: '0x0000000000000000000000000000000000000002',
  tokenXDecimals: 18,
  tokenYDecimals: 6,
  quoteToken: '0x0000000000000000000000000000000000000002',
  binStep: 100,
};

test('values range deposits per bin and labels them as deposits', () => {
  const flow = positionCashFlowFromPayload('increased', {
    bins: [0],
    amountsX: ['1000000000000000000'],
    amountsY: ['2000000'],
  }, 0, pool);
  assert.deepEqual(flow, { direction: 'deposit', amountQuote: '3' });
});

test('values actual decrease outputs and labels them as withdrawals', () => {
  const flow = positionCashFlowFromPayload('decreased', {
    amountX: '500000000000000000',
    amountY: '250000',
  }, 0, pool);
  assert.deepEqual(flow, { direction: 'withdrawal', amountQuote: '0.75' });
});

test('does not invent accounting when immutable event amounts are unavailable', () => {
  assert.equal(positionCashFlowFromPayload('created', {}, 0, pool), null);
  assert.equal(positionCashFlowFromPayload('closed', {}, 0, pool), null);
});
