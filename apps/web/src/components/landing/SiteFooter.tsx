import Link from 'next/link';

import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { ChainBadge } from '@/components/ui/ChainBadge';
import { XLogo } from '@/components/ui/icons';
import { LiveClock } from '@/components/ui/LiveClock';
import { StatusDot } from '@/components/ui/StatusDot';
import { footer, site } from '@/content/landing';

export function SiteFooter({ network }: { network: 'testnet' | 'mainnet' }) {
  return (
    <footer className="relative z-10 border-t border-line bg-bg pb-6 pt-[clamp(3rem,6vw,5rem)]">
      <div className="wrap">
        <div className="grid-12 gap-y-10">
          <div className="col-span-12 lg:col-span-4">
            <p className="inline-flex items-center gap-4">
              <BrandMark className="h-9 w-[42px]" />
              <Wordmark className="text-lg" />
            </p>
            <p className="mt-6 max-w-[18em]">{site.tagline}</p>
            <a
              href={site.x.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Follow @${site.x.handle} on X`}
              className="t-label mt-5 inline-flex items-center gap-2 text-muted transition-colors duration-fast hover:text-fg"
            >
              <XLogo className="size-3.5" />
              <span>@{site.x.handle}</span>
            </a>
          </div>

          {footer.columns.map(column => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="col-span-6 md:col-span-3 lg:col-span-2"
            >
              <h2 className="t-label mb-3 text-muted">{column.title}</h2>
              <ul>
                {column.items.map(item => (
                  <li key={item.label} className="py-1">
                    {item.href ? (
                      <Link href={item.href} className="transition-colors hover:text-signal">
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-muted">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="t-label mt-[clamp(3rem,6vw,5rem)] flex flex-wrap items-center gap-x-8 gap-y-2 text-muted">
          <span className="inline-flex items-center gap-2">
            <StatusDot live />
            <ChainBadge network={network} />
          </span>
          <LiveClock />
        </p>

        <div className="t-label mt-5 flex flex-wrap justify-between gap-x-8 gap-y-3 border-t border-line pt-5 text-muted">
          <p>{footer.legal.join(' · ')}</p>
          <p>{footer.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
