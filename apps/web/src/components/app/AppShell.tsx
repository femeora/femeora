'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/feedback/Toaster';
import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { StatusDot } from '@/components/ui/StatusDot';
import { site } from '@/content/landing';
import { TailSheet } from '@/features/callouts/components/TailSheet';
import { AccountButton } from '@/features/session/AccountButton';
import { SignInSheet } from '@/features/session/SignInSheet';
import { useRehydrateStores } from '@/features/session/useRehydrateStores';

import { AppBottomNav, AppTopNav } from './AppNav';

/**
 * Frame for every in-app screen. Separate from the landing chrome: one compact
 * top bar with tabs and identity, a bottom bar on mobile, no marketing footer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useRehydrateStores();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-50 h-14 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="flex h-full items-center gap-8 px-gutter">
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
            {site.chain}
          </p>
          <div className="ml-auto lg:ml-0">
            <AccountButton />
          </div>
        </div>
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
