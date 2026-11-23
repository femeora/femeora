import assert from 'node:assert/strict';
import test from 'node:test';

import type { PositionEventProjection } from '../position-events.js';

import { calloutUpdateEventKey, classifyCalloutUpdates } from './callout-updates.js';

function event(
  kind: PositionEventProjection['kind'],
  logIndex: number,
  transactionHash = `0x${'1'.repeat(64)}` as const,
): PositionEventProjection {
  return {
    kind,
    positionId: 1n,
    transactionHash,
    logIndex,
    transactionIndex: 0,
    blockNumber: 1n,
    blockHash: `0x${'2'.repeat(64)}`,
    timestamp: new Date(0),
    owner: null,
    state: {
      pool: `0x${'3'.repeat(40)}`,
      lowerBin: 0,
      upperBin: 1,
      shape: 0,
      tag: `0x${'0'.repeat(64)}`,
      referrer: `0x${'0'.repeat(40)}`,
      open: kind !== 'closed',
      activeBin: 0,
      bins: [],
    },
    payload: {},
  };
}

test('maps standalone liquidity lifecycle events to Added, Removed and Closed', () => {
  const added = event('increased', 1, `0x${'a'.repeat(64)}`);
  const removed = event('decreased', 2, `0x${'b'.repeat(64)}`);
  const closed = event('closed', 3, `0x${'c'.repeat(64)}`);
  const result = classifyCalloutUpdates([added, removed, closed]);
  assert.equal(result.get(calloutUpdateEventKey(added)), 'Added');
  assert.equal(result.get(calloutUpdateEventKey(removed)), 'Removed');
  assert.equal(result.get(calloutUpdateEventKey(closed)), 'Closed');
});

test('emits only Closed when full removal and close share a transaction', () => {
  const removed = event('decreased', 4);
  const closed = event('closed', 5);
  const result = classifyCalloutUpdates([removed, closed]);
  assert.equal(result.has(calloutUpdateEventKey(removed)), false);
  assert.equal(result.get(calloutUpdateEventKey(closed)), 'Closed');
  assert.equal(result.size, 1);
});

test('collapses decrease plus increase in one transaction into one Rebalanced update', () => {
  const removed = event('decreased', 6);
  const added = event('increased', 7);
  const result = classifyCalloutUpdates([removed, added]);
  assert.equal(result.has(calloutUpdateEventKey(removed)), false);
  assert.equal(result.get(calloutUpdateEventKey(added)), 'Rebalanced');
  assert.equal(result.size, 1);
});
