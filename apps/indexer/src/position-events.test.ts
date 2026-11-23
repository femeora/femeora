import assert from 'node:assert/strict';
import test from 'node:test';

import type { Address, Hex } from 'viem';

import type { IndexerClient } from './chain-client.js';
import { collectPositionEvents, collectPositionShareEvents } from './position-events.js';

const manager = '0x0000000000000000000000000000000000000010' as Address;
const owner = '0x0000000000000000000000000000000000000020' as Address;
const nextOwner = '0x0000000000000000000000000000000000000030' as Address;
const pool = '0x0000000000000000000000000000000000000040' as Address;
const referrer = '0x0000000000000000000000000000000000000050' as Address;
const zero = '0x0000000000000000000000000000000000000000' as Address;
const blockHash = `0x${'ab'.repeat(32)}` as Hex;
const transactionHash = `0x${'cd'.repeat(32)}` as Hex;
const tag = `0x${'ef'.repeat(32)}` as Hex;

test('normalizes position lifecycle events and ignores mint transfer duplication', async () => {
  const fakeClient = {
    async getContractEvents() {
      return [
        {
          eventName: 'Transfer',
          args: { from: zero, to: owner, tokenId: 1n },
          blockNumber: 100n,
          blockHash,
          transactionHash,
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          eventName: 'RangePositionCreated',
          args: { id: 1n, owner, pool, lowerBin: -2, upperBin: 2, shape: 1, tag, referrer },
          blockNumber: 100n,
          blockHash,
          transactionHash,
          transactionIndex: 0,
          logIndex: 1,
        },
        {
          eventName: 'RangePositionIncreased',
          args: { id: 1n, bins: [-2, 2], amountsX: [0n, 20n], amountsY: [10n, 0n] },
          blockNumber: 100n,
          blockHash,
          transactionHash,
          transactionIndex: 0,
          logIndex: 2,
        },
        {
          eventName: 'Transfer',
          args: { from: owner, to: nextOwner, tokenId: 1n },
          blockNumber: 100n,
          blockHash,
          transactionHash,
          transactionIndex: 0,
          logIndex: 3,
        },
      ];
    },
    async getBlock() {
      return { timestamp: 1_000n };
    },
    async readContract(options: { functionName: string; args: readonly unknown[] }) {
      if (options.functionName === 'positions') return [pool, -2, 2, 1, tag, referrer, true];
      if (options.functionName === 'positionBins') return [-2, 2];
      if (options.functionName === 'binShares') return options.args[1] === -2 ? 11n : 22n;
      if (options.functionName === 'activeBin') return 0;
      throw new Error('unexpected read');
    },
  } as unknown as IndexerClient;

  const events = await collectPositionEvents(fakeClient, manager, 100n, 100n);

  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => event.kind), ['created', 'increased', 'transferred']);
  assert.equal(events[0]?.owner, owner);
  assert.equal(events[2]?.owner, nextOwner);
  assert.deepEqual(events[0]?.state.bins, [
    { binId: -2, shares: '11' },
    { binId: 2, shares: '22' },
  ]);
  assert.deepEqual(events[1]?.payload, {
    bins: [-2, 2],
    amountsX: ['0', '20'],
    amountsY: ['10', '0'],
  });
});

test('normalizes exact position share checkpoints with transaction ordering', async () => {
  const fakeClient = {
    async getContractEvents() {
      return [{
        args: { id: 9n, bins: [-1, 1], shares: [123n, 456n] },
        blockNumber: 200n,
        blockHash,
        transactionHash,
        transactionIndex: 7,
        logIndex: 11,
      }];
    },
    async getBlock() {
      return { timestamp: 2_000n };
    },
  } as unknown as IndexerClient;

  const events = await collectPositionShareEvents(fakeClient, manager, 200n, 200n);
  assert.deepEqual(events, [{
    positionId: 9n,
    transactionHash,
    transactionIndex: 7,
    logIndex: 11,
    blockNumber: 200n,
    blockHash,
    timestamp: new Date(2_000_000),
    bins: [-1, 1],
    shares: ['123', '456'],
  }]);
});
