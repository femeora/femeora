import assert from 'node:assert/strict';
import test from 'node:test';

import type { ApiPositionActionPreparation, ApiPreparedTransaction } from '@fomeora/types';

import { executePositionAction } from './executePositionAction';

const account = '0x00000000000000000000000000000000000000aa' as const;
const tx = (last: string): ApiPreparedTransaction => ({ chainId: 46_630, to: `0x${last.padStart(40, '0')}`, data: '0x12', value: '0x0' });
const approval = tx('1');
const action = tx('2');
const quote = { positionId: '1', action: 'increase' as const, amountXRaw: '1', amountYRaw: '1', slippageBps: 50, blockNumber: '1' };

test('executes approval receipt, refresh, then position action receipt', async () => {
  const sent: ApiPreparedTransaction[] = [];
  const preparation: ApiPositionActionPreparation = { quote, approvals: [approval], action };
  await executePositionAction({
    account, preparation, refreshPreparation: async () => ({ quote, approvals: [], action }),
    send: async transaction => { sent.push(transaction); return `0x${String(sent.length).padStart(64, '0')}`; },
    wait: async () => ({ status: 'success' }),
  });
  assert.deepEqual(sent, [approval, action]);
});
