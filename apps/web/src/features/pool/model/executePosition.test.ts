import assert from 'node:assert/strict';
import test from 'node:test';

import type { ApiPositionPreparation, ApiPreparedTransaction } from '@fomeora/types';
import type { Hex } from 'viem';

import { executePreparedPosition } from './executePosition';

const account = '0x00000000000000000000000000000000000000aa' as const;
const transaction = (suffix: string): ApiPreparedTransaction => ({
  chainId: 46_630, to: `0x${suffix.padStart(40, '0')}`, data: '0x1234', value: '0x0',
});
const approvals = [transaction('1'), transaction('2')];
const create = transaction('3');
const quote = {
  pool: transaction('4').to, tokenX: approvals[0]!.to, tokenY: approvals[1]!.to,
  amountX: '1', amountY: '2', amountXRaw: '1', amountYRaw: '2', shape: 'curve' as const,
  activeBin: 0, bins: [-1, 0], amountsXRaw: ['0', '1'], amountsYRaw: ['2', '0'],
  minimumSharesRaw: ['1', '1'], slippageBps: 50, blockNumber: '1',
};

test('waits for both exact approvals with refreshes before create', async () => {
  const sent: ApiPreparedTransaction[] = [];
  const states: ApiPositionPreparation[] = [
    { quote, approvals: [approvals[1]!], create },
    { quote, approvals: [], create },
  ];
  const hash = await executePreparedPosition({
    account, preparation: { quote, approvals, create },
    refreshPreparation: async () => states.shift()!,
    send: async tx => { sent.push(tx); return `0x${String(sent.length).padStart(64, '0')}` as Hex; },
    wait: async () => ({ status: 'success' }),
  });
  assert.deepEqual(sent, [...approvals, create]);
  assert.equal(hash, `0x${'3'.padStart(64, '0')}`);
});

test('does not create when an approval reverts', async () => {
  const sent: ApiPreparedTransaction[] = [];
  await assert.rejects(executePreparedPosition({
    account, preparation: { quote, approvals, create },
    refreshPreparation: async () => ({ quote, approvals: [], create }),
    send: async tx => { sent.push(tx); return `0x${'1'.padStart(64, '0')}`; },
    wait: async () => ({ status: 'reverted' }),
  }), /APPROVAL_REVERTED/);
  assert.deepEqual(sent, [approvals[0]]);
});
