import type { ApiPreparedTransaction, ApiTailPreparation } from '@fomeora/types';
import type { Hex, TransactionReceipt } from 'viem';

import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { TransactionExecutionError } from '@/features/wallet/transactionError';

type Send = (transaction: ApiPreparedTransaction, account: `0x${string}`) => Promise<Hex>;
type Wait = (hash: Hex) => Promise<Pick<TransactionReceipt, 'status'>>;

export async function executePreparedTail(input: {
  account: `0x${string}`;
  preparation: ApiTailPreparation;
  refreshPreparation: () => Promise<ApiTailPreparation>;
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
    const approvalHash = await send(preparation.approvals[0]!, input.account);
    input.onStage?.('Approval pending…');
    if ((await wait(approvalHash)).status !== 'success') throw new TransactionExecutionError('APPROVAL_REVERTED', approvalHash);
    preparation = await input.refreshPreparation();
    if (preparation.approvals.length >= remaining) throw new Error('APPROVAL_NOT_EFFECTIVE');
    remaining = preparation.approvals.length;
  }
  input.onStage?.('Create tailed position');
  const hash = await send(preparation.create, input.account);
  input.onStage?.('Tail transaction pending…');
  if ((await wait(hash)).status !== 'success') throw new TransactionExecutionError('TAIL_CREATE_REVERTED', hash);
  return hash;
}
