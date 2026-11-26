'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';


import { Toaster } from '@/components/feedback/Toaster';
import { Ambient } from '@/components/ui/Ambient';
import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { ChainBadge } from '@/components/ui/ChainBadge';
import { XLogo } from '@/components/ui/icons';
import { StatusDot } from '@/components/ui/StatusDot';
import { site } from '@/content/landing';
import { TailSheet } from '@/features/callouts/components/TailSheet';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { AccountButton } from '@/features/session/AccountButton';
import { SignInSheet } from '@/features/session/SignInSheet';
import { useRehydrateStores } from '@/features/session/useRehydrateStores';
import { useWallet } from '@/features/wallet/store';
import { cn } from '@/lib/cn';

import { AppBottomNav, AppTopNav } from './AppNav';

/**
 * Frame for every in-app screen. Separate from the landing chrome: one compact
 * top bar with tabs and identity plus a bottom bar on mobile. The shared root
 * layout renders the site footer after this shell on every route.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useRehydrateStores();
  const config = useWallet(state => state.config);
  const testnet = config?.network === 'testnet';
  const prelaunch = config?.network === 'mainnet' && !config.protocolDeployed;

  return (
    <div className={cn('min-h-dvh [--app-header-height:3.5rem]', (testnet || prelaunch) && '[--app-header-height:5.5rem]')}>
      <Ambient />
      <header className="sticky top-0 z-50 border-b border-line bg-bg">
        <div className="flex h-14 items-center gap-8 px-gutter">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-3"
            aria-label={`${site.name} home`}
          >
            <BrandMark />
            <Wordmark />
          </Link>
          <AppTopNav />
          <p className="t-label ml-auto hidden items-center gap-2 text-muted lg:flex">
            <StatusDot tone="up" />
            {config ? <ChainBadge network={config.network} /> : <ChainBadge />}
          </p>
          <a
            href={site.x.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Follow @${site.x.handle} on X`}
            className="t-label hidden shrink-0 items-center gap-2 text-muted transition-colors duration-fast hover:text-fg md:inline-flex"
          >
            <XLogo className="size-3.5" />
            <span>@{site.x.handle}</span>
          </a>
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <NotificationBell />
            <AccountButton />
          </div>
        </div>
        {testnet ? (
          <p className="t-label flex h-8 items-center justify-center border-t border-signal/30 bg-signal/10 px-gutter text-center text-signal" role="status">
            Testnet · assets have no real-world value · {config.chainName}
          </p>
        ) : null}
        {prelaunch ? (
          <p className="t-label flex h-8 items-center justify-center border-t border-up/30 bg-up/10 px-gutter text-center text-up" role="status">
            Mainnet · protocol deployment pending · read-only preview
          </p>
        ) : null}
      </header>

      <main id="main" className="pb-20 md:pb-0">
        {children}
      </main>

      <AppBottomNav />
      <SignInSheet />
      <TailSheet />
      <Toaster />
    </div>
  );
}
