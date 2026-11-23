import type { ApiPositionActionPreparation, ApiPreparedTransaction } from '@fomeora/types';
import type { Hex, TransactionReceipt } from 'viem';

import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';

type Send = (transaction: ApiPreparedTransaction, account: `0x${string}`) => Promise<Hex>;
type Wait = (hash: Hex) => Promise<Pick<TransactionReceipt, 'status'>>;

export async function executePositionAction(input: {
  account: `0x${string}`;
  preparation: ApiPositionActionPreparation;
  refreshPreparation: () => Promise<ApiPositionActionPreparation>;
  send?: Send;
  wait?: Wait;
  onStage?: (label: string) => void;
}): Promise<Hex> {
  const send = input.send ?? sendPreparedTransaction;
  const wait = input.wait ?? waitForWalletReceipt;
  let preparation = input.preparation;
  let remaining = preparation.approvals.length;
  const total = remaining;
  while (preparation.approvals.length > 0) {
    input.onStage?.(`Approve token ${total - remaining + 1} of ${total}`);
    const hash = await send(preparation.approvals[0]!, input.account);
    input.onStage?.('Approval pending…');
    if ((await wait(hash)).status !== 'success') throw new Error('APPROVAL_REVERTED');
    preparation = await input.refreshPreparation();
    if (preparation.approvals.length >= remaining) throw new Error('APPROVAL_NOT_EFFECTIVE');
    remaining = preparation.approvals.length;
  }
  input.onStage?.(`${preparation.quote.action === 'close' ? 'Close' : preparation.quote.action === 'decrease' ? 'Decrease' : 'Increase'} position`);
  const hash = await send(preparation.action, input.account);
  input.onStage?.('Transaction pending…');
  if ((await wait(hash)).status !== 'success') throw new Error('POSITION_ACTION_REVERTED');
  return hash;
}
