'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { XLogo } from '@/components/ui/icons';
import { useSession } from '@/features/session/store';
import { useWallet } from '@/features/wallet/store';

interface TxButtonProps {
  label: string;
  error: string | null;
  onExecute?: () => Promise<void>;
  pendingLabel?: string;
}

const transactionError = (error: string | null) => {
  if (error === 'INSUFFICIENT_GAS_BALANCE') return 'Insufficient ETH for value and estimated gas';
  if (error === 'GAS_ESTIMATE_FAILED') return 'Gas estimate failed; transaction was not opened';
  if (error === 'TRANSACTION_REJECTED') return 'Transaction rejected in wallet';
  if (error === 'APPROVAL_REVERTED') return 'Approval reverted on-chain';
  if (error === 'SWAP_REVERTED') return 'Swap reverted on-chain';
  return error;
};

/** Honest transaction gate. Execution is enabled only after an API-prepared transaction exists. */
export function TxButton({ label, error, onExecute, pendingLabel = 'Checking balance and estimated gas…' }: TxButtonProps) {
  const { user, openSignIn } = useSession();
  const { account, chainId, config, status, connect, switchNetwork } = useWallet();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!user) {
    return (
      <Button variant="primary" block onClick={openSignIn}>
        Sign in with <XLogo className="size-3.5" />
        <span className="sr-only">X</span> to continue
      </Button>
    );
  }
  if (!user.wallet) {
    return <Button variant="primary" block onClick={openSignIn}>Link wallet</Button>;
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
  if (account.toLowerCase() !== user.wallet.toLowerCase()) {
    return <Button variant="primary" block onClick={() => void connect()}>Select linked wallet</Button>;
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
      await onExecute();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'TRANSACTION_FAILED');
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
