'use client';

import { ApiTailRewardClaimPreparationSchema } from '@fomeora/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/Button';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';

import type { Callout } from '../model/callout';

export function ClaimTailRewardsButton({ callout }: { callout: Callout }) {
  const wallet = useWallet();
  const showResult = useToast(state => state.show);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const ownsCallout = wallet.account?.toLowerCase() === callout.owner.toLowerCase();

  if (!ownsCallout || callout.closed || callout.tailers === 0) return null;

  const claim = async () => {
    if (!wallet.account) return;
    setPending(true);
    try {
      if (wallet.config && wallet.chainId !== wallet.config.chainId) {
        await wallet.switchNetwork();
        throw new Error('NETWORK_SWITCH_REQUIRED');
      }
      const prepared = await browserApiRequest(
        `/v1/callouts/${callout.id}/reward-claim-prepare`,
        ApiTailRewardClaimPreparationSchema,
        { method: 'POST', body: { walletAddress: wallet.account } }
      );
      const hash = await sendPreparedTransaction(prepared.transaction, wallet.account);
      const receipt = await waitForWalletReceipt(hash);
      if (receipt.status !== 'success') throw new TransactionExecutionError('TAIL_REWARD_CLAIM_REVERTED', hash);
      showResult('Caller rewards were settled on-chain.', {
        title: 'Rewards claimed',
        tone: 'success',
        transactionHash: hash,
        ...(wallet.config ? { explorerUrl: wallet.config.explorerUrl } : {}),
      });
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'TAIL_REWARD_CLAIM_FAILED';
      showResult(friendlyErrorMessage(message), {
        title: 'Rewards not claimed',
        tone: 'error',
        ...(cause instanceof TransactionExecutionError ? { transactionHash: cause.transactionHash } : {}),
        ...(wallet.config ? { explorerUrl: wallet.config.explorerUrl } : {}),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="ghost"
      className="ml-1 min-h-7 px-2.5 py-1"
      disabled={pending}
      onClick={() => void claim()}
    >
      {pending ? 'Claiming…' : 'Claim rewards'}
    </Button>
  );
}
