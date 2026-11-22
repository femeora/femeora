'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { LiveClock } from '@/components/ui/LiveClock';
import { StatusDot } from '@/components/ui/StatusDot';
import { navLinks, site } from '@/content/landing';
import { useHideOnScroll } from '@/hooks/useHideOnScroll';
import { cn } from '@/lib/cn';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolledAway = useHideOnScroll();
  const hidden = scrolledAway && !menuOpen;

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
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-header border-b border-line bg-bg/80 backdrop-blur-md transition-transform duration-base ease-brand',
        hidden && '-translate-y-full'
      )}
    >
      <div className="wrap grid h-full grid-cols-[auto_1fr_auto] items-center gap-6">
        <Link href="/" className="inline-flex items-center gap-3" aria-label={`${site.name} home`}>
          <BrandMark />
          <Wordmark />
        </Link>

        <p className="t-label hidden items-center justify-self-center gap-2.5 whitespace-nowrap text-muted xl:inline-flex">
          <StatusDot live />
          <LiveClock />
          <span className="text-faint">·</span>
          <span>{site.chain}</span>
          <span className="text-faint">·</span>
          <span>Mainnet</span>
        </p>

        <div className="flex items-center justify-self-end gap-6 md:gap-8">
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex gap-8">
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
          <StatusDot live />
          <LiveClock />
        </p>
      </nav>
    </header>
  );
}
