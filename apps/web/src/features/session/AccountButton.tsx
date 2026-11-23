'use client';

import Link from 'next/link';

import { useToast } from '@/components/feedback/toast';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { XLogo } from '@/components/ui/icons';
import { useWallet } from '@/features/wallet/store';

import { useSession } from './store';

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** Wallet-first top bar. X is requested only when social identity is needed. */
export function AccountButton() {
  const { user, openSignIn } = useSession();
  const { account, status: walletStatus, connect } = useWallet();
  const showResult = useToast(state => state.show);
  const connectWallet = async () => {
    await connect();
    const wallet = useWallet.getState();
    if (wallet.account) {
      showResult(`Wallet ${short(wallet.account)} connected.`, { title: 'Wallet connected' });
    } else {
      showResult(wallet.error ?? 'Wallet connection failed.', { title: 'Wallet connection failed', tone: 'error' });
    }
  };

  if (!account) {
    return (
      <Button variant="primary" onClick={() => void connectWallet()} disabled={walletStatus === 'connecting'} className="min-h-9 px-3.5">
        {walletStatus === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </Button>
    );
  }

  if (!user) {
    return (
      <Button variant="primary" onClick={openSignIn} className="min-h-9 px-3.5">
        <span className="font-mono text-xs">{short(account)}</span>
        <span className="text-muted">·</span>
        <XLogo className="size-3.5" /> Connect X
      </Button>
    );
  }

  if (!user.wallet) {
    return (
      <Button variant="primary" onClick={openSignIn} className="min-h-9 px-3.5">
        Link wallet
      </Button>
    );
  }

  if (account.toLowerCase() !== user.wallet.toLowerCase()) {
    return <Button variant="primary" onClick={() => void connectWallet()} className="min-h-9 px-3.5">Select linked wallet</Button>;
  }

  return (
    <Link
      href="/portfolio"
      className="glass-control flex min-h-9 items-center gap-2 rounded-[2px] py-1 pl-1 pr-3"
    >
      <Avatar seed={user.handle} size="sm" self />
      <span className="flex flex-col leading-tight">
        <span className="text-[0.8125rem]">@{user.handle}</span>
        <span className="t-label text-[0.625rem] text-muted">{user.wallet}</span>
      </span>
    </Link>
  );
}
