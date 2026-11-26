'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

import { appNav } from './navigation';

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

/** Desktop tabs inside the top bar. */
export function AppTopNav() {
  const isActive = useIsActive();
  return (
    <nav aria-label="App" className="hidden h-full md:block">
      <ul className="flex h-full gap-6">
        {appNav.map(item => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="h-full">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-full items-center border-b-2 text-[0.9375rem] transition-colors duration-fast',
                  active ? 'border-signal text-fg' : 'border-transparent text-muted hover:text-fg'
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile bottom bar, same destinations with icons and short labels. */
export function AppBottomNav() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="App"
      className="glass-raised fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-6">
        {appNav.map(item => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] transition-colors',
                  active ? 'text-fg' : 'text-muted'
                )}
              >
                <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
