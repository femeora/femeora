'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Close, LogOut, Wallet } from '@/components/ui/icons';
import { useWallet } from '@/features/wallet/store';

import { useSession } from './store';

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function ConnectedWalletButton({ account, seed, avatarUrl, title, subtitle }: {
  account: `0x${string}`;
  seed: string;
  avatarUrl?: string | null;
  title: string;
  subtitle: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const disconnect = useWallet(state => state.disconnect);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="glass-control flex min-h-9 items-center gap-2 rounded-[2px] py-1 pl-1 pr-3 text-left"
      aria-label={`Manage connected wallet ${account}`}
    >
      <Avatar seed={seed} src={avatarUrl} alt={`${title} avatar`} size="sm" self />
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[0.8125rem]">{title}</span>
        <span className="t-label text-[0.625rem] text-muted">{subtitle}</span>
      </span>
    </button>
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      aria-labelledby={titleId}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] glass-raised rounded-[2px] p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <header className="flex items-start justify-between gap-4">
          <div><p className="t-label text-muted">Connected wallet</p><h2 id={titleId} className="mt-1 font-mono text-lg">{short(account)}</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet menu" className="grid size-11 place-items-center text-muted hover:text-fg"><Close aria-hidden="true" className="size-5" /></button>
        </header>
        <p className="mt-3 break-all text-sm text-muted">{account}</p>
        <div className="mt-6 grid gap-2">
          <Link href="/portfolio" onClick={() => setOpen(false)} className="glass-control t-label inline-flex min-h-11 items-center justify-center gap-3 rounded-[2px] px-4"><Wallet aria-hidden="true" className="size-4" />Open portfolio</Link>
          <Button variant="ghost" block onClick={() => void disconnect().then(() => setOpen(false))}><LogOut aria-hidden="true" className="size-4" />Disconnect wallet</Button>
        </div>
        <p className="t-label mt-4 text-faint">Disconnecting removes this wallet from the current Femeora session. It does not move funds or revoke on-chain approvals.</p>
      </div>
    </dialog>
  </>;
}

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
    return <ConnectedWalletButton account={account} seed={account} title={short(account)} subtitle="Wallet connected" />;
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

  return <ConnectedWalletButton account={account} seed={user.handle} avatarUrl={user.avatarUrl} title={`@${user.handle}`} subtitle={short(user.wallet)} />;
}
