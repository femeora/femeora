import assert from 'node:assert/strict';
import test from 'node:test';

import { createBytes32Tag, createOpaqueToken, hashOpaqueToken } from './tokens.js';

test('opaque tokens are random and only persisted as SHA-256 hashes', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.notEqual(first, second);
  assert.match(hashOpaqueToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashOpaqueToken(first), hashOpaqueToken(first));
  assert.notEqual(hashOpaqueToken(first), first);
});

test('callout tags are bytes32 values', () => {
  assert.match(createBytes32Tag(), /^0x[a-f0-9]{64}$/);
});
