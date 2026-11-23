'use client';

import { useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/Button';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';

interface TxButtonProps {
  label: string;
  error: string | null;
  onExecute?: () => Promise<string | void>;
  pendingLabel?: string;
}

const transactionError = (error: string | null) => {
  if (error === 'INSUFFICIENT_GAS_BALANCE') return 'Insufficient ETH for value and estimated gas';
  if (error === 'GAS_ESTIMATE_FAILED') return 'Gas estimate failed; transaction was not opened';
  if (error === 'TRANSACTION_REJECTED') return 'Transaction rejected in wallet';
  if (error === 'APPROVAL_REVERTED') return 'Approval reverted on-chain';
  if (error === 'SWAP_REVERTED') return 'Swap reverted on-chain';
  if (error === 'POSITION_CREATE_REVERTED') return 'Position creation reverted on-chain';
  if (error === 'TAIL_CREATE_REVERTED') return 'Tail position reverted on-chain';
  if (error === 'POSITION_ACTION_REVERTED') return 'Position transaction reverted on-chain';
  return error;
};

/** Honest transaction gate. Execution is enabled only after an API-prepared transaction exists. */
export function TxButton({ label, error, onExecute, pendingLabel = 'Checking balance and estimated gas…' }: TxButtonProps) {
  const { account, chainId, config, status, connect, switchNetwork } = useWallet();
  const showResult = useToast(state => state.show);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (config && !config.protocolDeployed) {
    return <Button variant="primary" block disabled>Protocol deployment pending</Button>;
  }
  if (status === 'unavailable') {
    return <Button variant="primary" block disabled>Open in a wallet browser</Button>;
  }
  if (!account) {
    return (
      <Button variant="primary" block onClick={() => void connect()} disabled={status === 'connecting'}>
        {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </Button>
    );
  }
  if (config && chainId !== config.chainId) {
    return <Button variant="primary" block onClick={() => void switchNetwork()}>Switch to {config.chainName}</Button>;
  }
  if (!onExecute) {
    return <Button variant="primary" block disabled>{error ?? `${label} · transaction API pending`}</Button>;
  }
  const execute = async () => {
    setPending(true);
    setActionError(null);
    try {
      const transactionHash = await onExecute();
      showResult(`${label} confirmed on-chain.`, {
        title: 'Transaction successful',
        tone: 'success',
        ...(transactionHash ? { transactionHash } : {}),
        ...(config ? { explorerUrl: config.explorerUrl } : {}),
      });
    } catch (cause) {
      const nextError = cause instanceof Error ? cause.message : 'TRANSACTION_FAILED';
      setActionError(nextError);
      showResult(transactionError(nextError) ?? 'Transaction failed.', {
        title: 'Transaction failed',
        tone: 'error',
        ...(cause instanceof TransactionExecutionError ? { transactionHash: cause.transactionHash } : {}),
        ...(config ? { explorerUrl: config.explorerUrl } : {}),
      });
    } finally {
      setPending(false);
    }
  };
  return (
    <Button variant="primary" block disabled={Boolean(error) || pending} onClick={() => void execute()}>
      {pending ? pendingLabel : (transactionError(actionError) ?? error ?? label)}
    </Button>
  );
}
