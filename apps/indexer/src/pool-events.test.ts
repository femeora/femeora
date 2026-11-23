import assert from 'node:assert/strict';
import test from 'node:test';

import type { Address, Hex } from 'viem';

import type { IndexerClient } from './chain-client.js';
import { collectPoolEvents, type PoolDescriptor } from './pool-events.js';

const dlmm = '0x0000000000000000000000000000000000000011' as Address;
const damm = '0x0000000000000000000000000000000000000022' as Address;
const tokenX = '0x0000000000000000000000000000000000000033' as Address;
const tokenY = '0x0000000000000000000000000000000000000044' as Address;
const sender = '0x0000000000000000000000000000000000000055' as Address;
const recipient = '0x0000000000000000000000000000000000000066' as Address;
const blockHash = `0x${'ab'.repeat(32)}` as Hex;

test('projects DLMM bins and distinguishes DLMM/DAMM swap fields', async () => {
  let eventCall = 0;
  const fakeClient = {
    async getContractEvents() {
      eventCall += 1;
      if (eventCall === 1) {
        return [
          {
            address: dlmm,
            blockNumber: 100n,
            args: { ids: [7], reserves0: [10n], reserves1: [20n] },
          },
        ];
      }
      if (eventCall === 2) {
        return [
          {
            address: dlmm,
            blockNumber: 100n,
            blockHash,
            transactionHash: `0x${'01'.repeat(32)}`,
            transactionIndex: 0,
            logIndex: 1,
            args: {
              binId: 7,
              token0ToToken1: true,
              lpFee: 1n,
              totalShares: 30n,
            },
          },
        ];
      }
      if (eventCall === 3) {
        return [
          {
            address: dlmm,
            blockNumber: 100n,
            blockHash,
            transactionHash: `0x${'01'.repeat(32)}`,
            transactionIndex: 0,
            logIndex: 2,
            args: {
              sender,
              recipient,
              token0ToToken1: true,
              amountIn: 100n,
              amountOut: 90n,
              activeBinBefore: 7,
              activeBinAfter: 8,
              totalFee: 2n,
              protocolFee: 1n,
              binsCrossed: 2,
            },
          },
        ];
      }
      if (eventCall === 4) return [
        {
          address: damm,
          blockNumber: 100n,
          blockHash,
          transactionHash: `0x${'02'.repeat(32)}`,
          transactionIndex: 1,
          logIndex: 3,
          args: { sender, recipient, tokenIn: tokenY, amountIn: 200n, amountOut: 180n, protocolFee: 1n },
        },
      ];
      return [];
    },
    async readContract(request: { functionName: string }) {
      if (request.functionName === 'reserve0') return 820n;
      if (request.functionName === 'reserve1') return 2_199n;
      return [10n, 20n, 30n, 1n] as const;
    },
    async getBlockNumber() {
      return 100n;
    },
    async getBlock() {
      return { timestamp: 1_000n };
    },
  } as unknown as IndexerClient;
  const pools: PoolDescriptor[] = [
    { address: dlmm, type: 'DLMM', tokenX, tokenY },
    { address: damm, type: 'DAMM', tokenX, tokenY },
  ];

  const result = await collectPoolEvents(fakeClient, pools, 100n, 100n);

  assert.deepEqual(result.bins, [
    { poolAddress: dlmm, binId: 7, reserveX: '10', reserveY: '20', totalShares: '30', blockNumber: 100n },
  ]);
  assert.deepEqual(result.binFees, [
    {
      poolAddress: dlmm,
      transactionHash: `0x${'01'.repeat(32)}`,
      logIndex: 1,
      transactionIndex: 0,
      blockNumber: 100n,
      blockHash,
      timestamp: new Date(1_000_000),
      binId: 7,
      tokenIn: tokenX,
      lpFee: '1',
      totalShares: '30',
    },
  ]);
  assert.equal(result.swaps.length, 2);
  assert.equal(result.swaps[0]?.tokenIn, tokenX);
  assert.equal(result.swaps[0]?.totalFee, '2');
  assert.equal(result.swaps[0]?.activeBinAfter, 8);
  assert.equal(result.swaps[1]?.tokenIn, tokenY);
  assert.equal(result.swaps[1]?.totalFee, null);
  assert.equal(result.swaps[1]?.activeBinAfter, null);
  assert.equal(result.swaps[1]?.reserveXAfter, '820');
  assert.equal(result.swaps[1]?.reserveYAfter, '2199');
});
