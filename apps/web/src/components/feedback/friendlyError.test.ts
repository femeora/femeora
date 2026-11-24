import assert from 'node:assert/strict';
import test from 'node:test';

import { friendlyErrorMessage } from './friendlyError';

test('explains a rejected wallet request without exposing the raw error', () => {
  const raw = 'User rejected request: ACTION_REJECTED (code=4001)';
  const message = friendlyErrorMessage(raw);
  assert.match(message, /cancelled in your wallet/i);
  assert.doesNotMatch(message, /4001|ACTION_REJECTED/);
});

test('gives an actionable insufficient-funds message', () => {
  assert.match(friendlyErrorMessage('INSUFFICIENT_GAS_BALANCE'), /add funds/i);
});

test('explains a deposit that is too small for its selected range', () => {
  const message = friendlyErrorMessage('DEPOSIT_TOO_SMALL');
  assert.match(message, /narrow the range|increase the token amount/i);
  assert.doesNotMatch(message, /DEPOSIT_TOO_SMALL/);
});

test('never returns an unknown technical error verbatim', () => {
  const raw = 'Internal JSON-RPC error: execution payload 0xdeadbeef';
  const message = friendlyErrorMessage(raw);
  assert.notEqual(message, raw);
  assert.doesNotMatch(message, /0xdeadbeef/);
});
