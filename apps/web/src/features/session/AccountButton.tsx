'use client';

import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { XLogo } from '@/components/ui/icons';

import { useSession } from './store';

/** Top-bar identity: Sign in with X when signed out, handle and wallet when signed in. */
export function AccountButton() {
  const { user, status, openSignIn } = useSession();

  if (status === 'loading') {
    return <span className="t-label text-muted">Checking session…</span>;
  }

  if (!user) {
    return (
      <Button variant="primary" onClick={openSignIn} className="min-h-9 px-3.5">
        <XLogo className="size-3.5" /> Sign in<span className="sr-only"> with X</span>
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
