import type { ApiPreparedTransaction, ApiSwapPreparation } from '@fomeora/types';
import type { Hex, TransactionReceipt } from 'viem';

import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { TransactionExecutionError } from '@/features/wallet/transactionError';

type Send = (transaction: ApiPreparedTransaction, account: `0x${string}`) => Promise<Hex>;
type Wait = (hash: Hex) => Promise<Pick<TransactionReceipt, 'status'>>;

export async function executePreparedSwap(input: {
  account: `0x${string}`;
  preparation: ApiSwapPreparation;
  refreshPreparation: () => Promise<ApiSwapPreparation>;
  send?: Send;
  wait?: Wait;
}): Promise<Hex> {
  const send = input.send ?? sendPreparedTransaction;
  const wait = input.wait ?? waitForWalletReceipt;
  let preparation = input.preparation;
  if (preparation.approval) {
    const approvalHash = await send(preparation.approval, input.account);
    if ((await wait(approvalHash)).status !== 'success') throw new TransactionExecutionError('APPROVAL_REVERTED', approvalHash);
    preparation = await input.refreshPreparation();
    if (preparation.approval) throw new Error('APPROVAL_NOT_EFFECTIVE');
  }
  const hash = await send(preparation.swap, input.account);
  if ((await wait(hash)).status !== 'success') throw new TransactionExecutionError('SWAP_REVERTED', hash);
  return hash;
}
