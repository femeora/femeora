import Image from 'next/image';

import { cn } from '@/lib/cn';

/** Fomeora's chrome infinity mark, shared by every product surface. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/fomeora-logo.png"
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      className={cn('size-7 shrink-0 rounded-full object-contain', className)}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap text-[0.8125rem] font-medium uppercase tracking-[0.14em]',
        className
      )}
    >
      Fomeora
    </span>
  );
}
