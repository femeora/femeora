'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Close, XLogo } from '@/components/ui/icons';

import { useSession } from './store';

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Sign in with X, then link a wallet with SIWE (brief 4.2). Built on the native
 * <dialog> for focus containment, Escape and focus return.
 */
export function SignInSheet() {
  const { signInOpen, closeSignIn, signIn } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [handle, setHandle] = useState('');
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (signInOpen && !dialog.open) dialog.showModal();
    if (!signInOpen && dialog.open) dialog.close();
  }, [signInOpen]);

  const valid = HANDLE.test(handle);
  const showError = touched && !valid;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    signIn(handle);
    setHandle('');
    setTouched(false);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={closeSignIn}
      aria-labelledby={`${inputId}-title`}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[2px] border border-line-strong bg-panel p-0 text-fg backdrop:bg-black/70"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 p-5">
        <header className="flex items-center justify-between">
          <h2 id={`${inputId}-title`} className="flex items-center gap-2 text-xl font-medium">
            Sign in with <XLogo className="size-[1.05rem]" />
            <span className="sr-only">X</span>
          </h2>
          <button
            type="button"
            onClick={closeSignIn}
            aria-label="Close"
            className="grid size-11 place-items-center text-muted hover:text-fg"
          >
            <Close aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </button>
        </header>

        <p className="text-muted">
          Fomeora uses X only to know who you are. We read your handle, name and avatar. We cannot
          post, like or DM on X.
        </p>
        <p className="t-label rounded-[2px] border border-line p-3 text-muted">
          Requested access · <span className="text-fg">Read your profile</span> · No write access
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="t-label text-muted">
            X handle
          </label>
          <div className="flex items-center rounded-[2px] border border-line-strong px-3 focus-within:border-fg">
            <span className="text-muted">@</span>
            <input
              id={inputId}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={handle}
              onChange={event => setHandle(event.target.value.trim())}
              onBlur={() => setTouched(true)}
              aria-invalid={showError}
              aria-describedby={errorId}
              className="min-h-11 flex-1 bg-transparent pl-1 text-base outline-none"
            />
          </div>
          <p id={errorId} role="alert" className="t-label min-h-4 text-down">
            {showError ? 'Use 1 to 15 letters, numbers or underscores' : null}
          </p>
        </div>

        <ol className="t-label flex flex-col gap-1 text-muted">
          <li>01 · Authorize read access on X</li>
          <li>02 · Sign a message to link your wallet (SIWE)</li>
        </ol>

        <Button type="submit" variant="primary" block>
          Authorize and link wallet
        </Button>
      </form>
    </dialog>
  );
}
