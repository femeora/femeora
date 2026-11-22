import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'border-fg bg-fg text-bg enabled:hover:border-signal enabled:hover:bg-signal enabled:hover:text-on-signal',
  ghost: 'border-line-strong text-fg enabled:hover:border-fg',
};

/** Mono uppercase button. Pairs with `ButtonLink` for navigation. */
export function Button({
  variant = 'ghost',
  block = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        't-label inline-flex min-h-11 items-center justify-center gap-3 rounded-[2px] border px-5 leading-none tracking-[0.08em] transition-colors duration-fast ease-brand disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        block && 'w-full',
        className
      )}
      {...props}
    />
  );
}
