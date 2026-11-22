'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { XLogo } from '@/components/ui/icons';

import { useSession } from './store';

/** Top-bar identity: Sign in with X when signed out, handle and wallet when signed in. */
export function AccountButton() {
  const { user, openSignIn } = useSession();

  if (!user) {
    return (
      <Button variant="primary" onClick={openSignIn} className="min-h-9 px-3.5">
        <XLogo className="size-3.5" /> Sign in<span className="sr-only"> with X</span>
      </Button>
    );
  }

  return (
    <Link
      href="/portfolio"
      className="flex min-h-9 items-center gap-2 rounded-[2px] border border-line-strong py-1 pl-1 pr-3 transition-colors hover:border-fg"
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-full bg-signal font-mono text-[0.625rem] text-on-signal"
      >
        {user.initials}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[0.8125rem]">@{user.handle}</span>
        <span className="t-label text-[0.625rem] text-muted">{user.wallet}</span>
      </span>
    </Link>
  );
}
