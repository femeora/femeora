import assert from 'node:assert/strict';
import test from 'node:test';

import { ConnectionLimiter, formatSseEvent, parseLastEventId, SSE_CONNECTIONS_PER_IP } from './outbox.js';

test('validates Last-Event-ID without accepting signs or non-decimal values', () => {
  assert.equal(parseLastEventId(undefined), null);
  assert.equal(parseLastEventId('0'), 0n);
  assert.equal(parseLastEventId('18446744073709551616'), 18446744073709551616n);
  assert.equal(parseLastEventId('-1'), null);
  assert.equal(parseLastEventId('+1'), null);
  assert.equal(parseLastEventId('1.0'), null);
  assert.equal(parseLastEventId('1\n2'), null);
});

test('formats a durable outbox row as a resumable SSE event', () => {
  const formatted = formatSseEvent({
    id: 42n,
    topic: 'callout.new',
    aggregateId: 'callout-id',
    createdAt: new Date('2026-11-22T12:00:00.000Z'),
    payload: { positionId: '7' },
  });
  assert.equal(
    formatted,
    'id: 42\nevent: callout.new\ndata: {"aggregateId":"callout-id","createdAt":"2026-11-22T12:00:00.000Z","payload":{"positionId":"7"}}\n\n',
  );
});

test('caps concurrent SSE connections per IP and releases capacity', () => {
  const limiter = new ConnectionLimiter();
  for (let index = 0; index < SSE_CONNECTIONS_PER_IP; index += 1) assert.equal(limiter.acquire('127.0.0.1'), true);
  assert.equal(limiter.acquire('127.0.0.1'), false);
  assert.equal(limiter.acquire('127.0.0.2'), true);
  limiter.release('127.0.0.1');
  assert.equal(limiter.acquire('127.0.0.1'), true);
});
