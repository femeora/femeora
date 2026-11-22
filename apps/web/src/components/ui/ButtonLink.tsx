import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost';

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

const base =
  't-label inline-flex min-h-11 items-center gap-3 rounded-[2px] border px-5 leading-none tracking-[0.08em] transition-colors duration-fast ease-brand';

const variants: Record<Variant, string> = {
  primary: 'border-fg bg-fg text-bg hover:border-signal hover:bg-signal hover:text-on-signal',
  ghost: 'border-line-strong text-fg hover:border-fg',
};

/** Mono, uppercase call to action. Internal routes use Next's client navigation. */
export function ButtonLink({ href, children, variant = 'ghost', className }: ButtonLinkProps) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
