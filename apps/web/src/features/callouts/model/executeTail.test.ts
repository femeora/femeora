import assert from 'node:assert/strict';
import test from 'node:test';

import type { ApiPreparedTransaction, ApiTailPreparation } from '@fomeora/types';

import { executePreparedTail } from './executeTail';

const account = '0x00000000000000000000000000000000000000aa' as const;
const tx = (last: string): ApiPreparedTransaction => ({ chainId: 46_630, to: `0x${last.padStart(40, '0')}`, data: '0x12', value: '0x0' });
const approval = tx('1');
const create = tx('2');
const quote = { mode: 'same_range' as const, pool: tx('3').to, poolType: 'DLMM' as const, expectedActiveBin: 0, lowerBin: -1, upperBin: 1, shape: 0, requiresTokenX: true, requiresTokenY: true, warnings: [], amountXRaw: '1', amountYRaw: '1', blockNumber: '1' };

test('waits for tail approval, refreshes, then waits for position receipt', async () => {
  const sent: ApiPreparedTransaction[] = [];
  const preparation: ApiTailPreparation = { quote, approvals: [approval], create };
  const hash = await executePreparedTail({
    account, preparation, refreshPreparation: async () => ({ quote, approvals: [], create }),
    send: async transaction => { sent.push(transaction); return `0x${String(sent.length).padStart(64, '0')}`; },
    wait: async () => ({ status: 'success' }),
  });
  assert.deepEqual(sent, [approval, create]);
  assert.equal(hash, `0x${'2'.padStart(64, '0')}`);
});
