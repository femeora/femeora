import assert from 'node:assert/strict';
import test from 'node:test';

import type { ApiPreparedTransaction, ApiSwapPreparation } from '@fomeora/types';
import type { Hex } from 'viem';

import { executePreparedSwap } from './executeSwap';

const account = '0x00000000000000000000000000000000000000aa' as const;
const approval: ApiPreparedTransaction = {
  chainId: 46_630,
  to: '0x00000000000000000000000000000000000000bb',
  data: '0x1234',
  value: '0x0',
};
const swap: ApiPreparedTransaction = {
  chainId: 46_630,
  to: '0x00000000000000000000000000000000000000cc',
  data: '0xabcd',
  value: '0x0',
};
const quote = {
  pool: approval.to,
  tokenIn: approval.to,
  tokenOut: swap.to,
  tokenInDecimals: 18,
  tokenOutDecimals: 18,
  amountIn: '1',
  amountInRaw: '1000000000000000000',
  amountOut: '2',
  amountOutRaw: '2000000000000000000',
  minimumAmountOut: '1.99',
  minimumAmountOutRaw: '1990000000000000000',
  totalFeeRaw: '1',
  binCrossings: 1,
  slippageBps: 50,
  maximumBinCrossings: 32,
  blockNumber: '1',
  expiresAt: '2026-11-23T00:00:30.000Z',
};

test('waits for exact approval, refreshes preparation, then waits for swap', async () => {
  const sent: ApiPreparedTransaction[] = [];
  const hashes = [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`] as Hex[];
  let refreshed = 0;
  const result = await executePreparedSwap({
    account,
    preparation: { quote, approval, swap },
    refreshPreparation: async (): Promise<ApiSwapPreparation> => {
      refreshed += 1;
      return { quote, approval: null, swap };
    },
    send: async transaction => {
      sent.push(transaction);
      return hashes[sent.length - 1] as Hex;
    },
    wait: async () => ({ status: 'success' }),
  });
  assert.deepEqual(sent, [approval, swap]);
  assert.equal(refreshed, 1);
  assert.equal(result, hashes[1]);
});

test('never sends the swap when approval reverts', async () => {
  const sent: ApiPreparedTransaction[] = [];
  await assert.rejects(executePreparedSwap({
    account,
    preparation: { quote, approval, swap },
    refreshPreparation: async () => ({ quote, approval: null, swap }),
    send: async transaction => {
      sent.push(transaction);
      return `0x${'11'.repeat(32)}`;
    },
    wait: async () => ({ status: 'reverted' }),
  }), /APPROVAL_REVERTED/);
  assert.deepEqual(sent, [approval]);
});
