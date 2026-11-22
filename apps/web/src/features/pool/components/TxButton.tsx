'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { XLogo } from '@/components/ui/icons';
import { useSession } from '@/features/session/store';

/** Time the wallet confirmation takes in this client before the tx resolves. */
const CONFIRM_MS = 900;

interface TxButtonProps {
  /** Action label when the form is valid, e.g. "Create position". */
  label: string;
  /** First blocking problem with the form; shown on the disabled button. */
  error: string | null;
  onConfirmed: () => void;
}

/**
 * Primary CTA for trade forms (brief 8.3 CTA states): sign in, action, pending,
 * done. `onConfirmed` is where the signed tx result is handled.
 */
export function TxButton({ label, error, onConfirmed }: TxButtonProps) {
  const { user, openSignIn } = useSession();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!user) {
    return (
      <Button variant="primary" block onClick={openSignIn}>
        Sign in with <XLogo className="size-3.5" />
        <span className="sr-only">X</span> to continue
      </Button>
    );
  }

  const confirm = () => {
    setPending(true);
    timer.current = setTimeout(() => {
      setPending(false);
      onConfirmed();
    }, CONFIRM_MS);
  };

  return (
    <Button
      variant="primary"
      block
      disabled={Boolean(error) || pending}
      aria-busy={pending}
      onClick={confirm}
    >
      {pending ? 'Confirm in your wallet…' : (error ?? label)}
    </Button>
  );
}
