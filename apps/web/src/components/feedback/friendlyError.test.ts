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

test('explains why a legacy-pool position cannot create a callout', () => {
  const message = friendlyErrorMessage('POSITION_POOL_NOT_CANONICAL');
  assert.match(message, /legacy pool/i);
  assert.match(message, /manage or close/i);
  assert.doesNotMatch(message, /POSITION_POOL_NOT_CANONICAL/);
});

test('turns database pool pressure into a temporary user-facing message', () => {
  const message = friendlyErrorMessage('SERVICE_TEMPORARILY_BUSY');
  assert.match(message, /high activity|try again/i);
  assert.doesNotMatch(message, /SERVICE_TEMPORARILY_BUSY|P2024/i);
});

test('never returns an unknown technical error verbatim', () => {
  const raw = 'Internal JSON-RPC error: execution payload 0xdeadbeef';
  const message = friendlyErrorMessage(raw);
  assert.notEqual(message, raw);
  assert.doesNotMatch(message, /0xdeadbeef/);
});
