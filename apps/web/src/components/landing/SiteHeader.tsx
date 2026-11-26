'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ChainBadge } from '@/components/ui/ChainBadge';
import { XLogo } from '@/components/ui/icons';
import { StatusDot } from '@/components/ui/StatusDot';
import { navLinks, site } from '@/content/landing';

export function SiteHeader({ network }: { network: 'testnet' | 'mainnet' }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-header border-b border-line bg-bg/95 backdrop-blur-md">
      <div className="wrap grid h-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 lg:gap-6">
        <Link href="/" className="inline-flex items-center gap-3" aria-label={`${site.name} home`}>
          <BrandMark />
          <Wordmark className="hidden min-[390px]:inline" />
        </Link>

        <p className="t-label hidden items-center justify-self-center gap-2.5 whitespace-nowrap text-muted xl:inline-flex">
          <StatusDot tone="up" />
          <ChainBadge network={network} />
        </p>

        <div className="flex items-center justify-self-end gap-1 sm:gap-3 md:gap-5 lg:gap-7">
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex gap-5 lg:gap-8">
              {navLinks.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[0.9375rem] text-muted transition-colors duration-fast hover:text-fg"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <a
            href={site.x.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Follow @${site.x.handle} on X`}
            className="t-label inline-flex size-11 shrink-0 items-center justify-center gap-2 text-muted transition-colors duration-fast hover:text-fg lg:w-auto lg:px-1"
          >
            <XLogo aria-hidden="true" className="size-3.5" />
            <span className="hidden lg:inline">@{site.x.handle}</span>
          </a>

          <ButtonLink href={site.appCta.href} variant="primary" className="min-h-9 px-3.5">
            {site.appCta.label}
          </ButtonLink>

          <button
            type="button"
            className="t-label -mr-2 inline-flex min-h-11 items-center px-2 text-fg md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(open => !open)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <nav
        id="mobile-menu"
        aria-label="Mobile"
        hidden={!menuOpen}
        className="absolute inset-x-0 top-full h-[calc(100dvh-56px)] overflow-y-auto bg-bg md:hidden"
      >
        <ul className="wrap flex flex-col pt-6">
          {navLinks.map(link => (
            <li key={link.href} className="border-b border-line">
              <Link href={link.href} onClick={closeMenu} className="block py-4 text-h2 font-medium">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="wrap t-label mt-8 flex items-center gap-2.5 text-muted">
          <StatusDot tone="up" />
          <ChainBadge network={network} />
        </p>
        <a
          href={site.x.href}
          target="_blank"
          rel="noreferrer"
          onClick={closeMenu}
          className="wrap t-label mt-5 flex min-h-11 items-center gap-2 text-muted"
        >
          <XLogo aria-hidden="true" className="size-3.5" />@{site.x.handle}
        </a>
      </nav>
    </header>
  );
}
