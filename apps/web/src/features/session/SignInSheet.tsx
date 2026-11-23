'use client';

import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Close, XLogo } from '@/components/ui/icons';

import { useSession } from './store';

const ERRORS: Record<string, string> = {
  WALLET_PROVIDER_NOT_FOUND: 'No injected wallet was found. Open Fomeora in a wallet browser or install a wallet extension.',
  WALLET_ACCOUNT_REQUIRED: 'The wallet did not provide an account.',
  AUTHENTICATION_REQUIRED: 'Your session expired. Sign in with X again.',
  WALLET_ALREADY_LINKED: 'That wallet is already linked to another Fomeora account.',
  WALLET_LIMIT_REACHED: 'This account already has the maximum of three linked wallets.',
  X_AUTH_INVALID: 'The X sign-in response was incomplete. Please start again.',
  X_AUTH_STATE_INVALID: 'The X sign-in request expired or was already used. Please start again.',
  X_AUTH_UPSTREAM_FAILED: 'X could not complete sign-in. Please try again later.',
};

/** Real X OAuth and one-time EIP-191 wallet-link flow. */
export function SignInSheet() {
  const { signInOpen, closeSignIn, startXSignIn, linkWallet, user, error } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (signInOpen && !dialog.open) dialog.showModal();
    if (!signInOpen && dialog.open) dialog.close();
  }, [signInOpen]);

  const needsWallet = Boolean(user && !user.wallet);

  return (
    <dialog
      ref={dialogRef}
      onClose={closeSignIn}
      aria-labelledby={titleId}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] glass-raised rounded-[2px] p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-5 p-5">
        <header className="flex items-center justify-between">
          <h2 id={titleId} className="flex items-center gap-2 text-xl font-medium">
            {needsWallet ? 'Link your wallet' : <>Sign in with <XLogo className="size-[1.05rem]" /><span className="sr-only">X</span></>}
          </h2>
          <button type="button" onClick={closeSignIn} aria-label="Close" className="grid size-11 place-items-center text-muted hover:text-fg">
            <Close aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </button>
        </header>

        {needsWallet ? (
          <>
            <p className="text-muted">
              Signed in as <span className="text-fg">@{user?.handle}</span>. Sign one Femeora ownership message in your wallet; no transaction or token approval is requested.
            </p>
            <ol className="t-label flex flex-col gap-1 text-muted">
              <li>01 · Connect an injected wallet</li>
              <li>02 · Sign the one-time EIP-191 message</li>
              <li>03 · The verified address is linked to your X identity</li>
            </ol>
            <Button type="button" variant="primary" block onClick={() => void linkWallet()}>
              Connect and sign
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted">
              Fomeora reads your X handle, name, avatar and verification status. It cannot post, like or send messages on X.
            </p>
            <p className="glass t-label rounded-[2px] p-3 text-muted">
              Requested scope · <span className="text-fg">users.read</span> · No write access
            </p>
            <Button type="button" variant="primary" block onClick={startXSignIn}>
              <XLogo className="size-3.5" /> Continue with X
            </Button>
          </>
        )}

        <p role="alert" className="min-h-5 text-sm text-down">
          {error ? (ERRORS[error] ?? 'The session request could not be completed. Please try again.') : null}
        </p>
      </div>
    </dialog>
  );
}
