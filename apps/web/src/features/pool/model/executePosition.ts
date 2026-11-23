import type { ApiPositionPreparation, ApiPreparedTransaction } from '@fomeora/types';
import type { Hex, TransactionReceipt } from 'viem';

import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';

type Send = (transaction: ApiPreparedTransaction, account: `0x${string}`) => Promise<Hex>;
type Wait = (hash: Hex) => Promise<Pick<TransactionReceipt, 'status'>>;

export async function executePreparedPosition(input: {
  account: `0x${string}`;
  preparation: ApiPositionPreparation;
  refreshPreparation: () => Promise<ApiPositionPreparation>;
  send?: Send;
  wait?: Wait;
  onStage?: (label: string) => void;
}): Promise<Hex> {
  const send = input.send ?? sendPreparedTransaction;
  const wait = input.wait ?? waitForWalletReceipt;
  let preparation = input.preparation;
  let approvalCount = preparation.approvals.length;
  const totalApprovals = approvalCount;
  while (preparation.approvals.length > 0) {
    const approval = preparation.approvals[0]!;
    input.onStage?.(`Approve token ${totalApprovals - approvalCount + 1} of ${totalApprovals}`);
    const hash = await send(approval, input.account);
    input.onStage?.('Approval pending…');
    if ((await wait(hash)).status !== 'success') throw new Error('APPROVAL_REVERTED');
    preparation = await input.refreshPreparation();
    if (preparation.approvals.length >= approvalCount) throw new Error('APPROVAL_NOT_EFFECTIVE');
    approvalCount = preparation.approvals.length;
  }
  input.onStage?.('Create position');
  const hash = await send(preparation.create, input.account);
  input.onStage?.('Position pending…');
  if ((await wait(hash)).status !== 'success') throw new Error('POSITION_CREATE_REVERTED');
  return hash;
}
