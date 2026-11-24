import Image from 'next/image';

import { cn } from '@/lib/cn';
import { tokenMeta } from '@/lib/tokens';

export function TokenIcon({ token, className }: { token: string; className?: string | undefined }) {
  const meta = tokenMeta(token);
  return (
    <span
      className={cn(
        'relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-fg/15 bg-panel-2 shadow-[0_3px_14px_rgb(0_0_0/0.32)]',
        className,
      )}
    >
      {meta.logo ? (
        <Image src={meta.logo} alt={`${meta.name} logo`} fill sizes="36px" className="object-cover" />
      ) : (
        <span aria-hidden="true" className="size-3 rounded-full border border-fg/50 shadow-[0_0_0_4px_rgb(var(--fg)/0.08)]" />
      )}
    </span>
  );
}

export function TokenPair({ tokenX, tokenY, compact = false }: { tokenX: string; tokenY: string; compact?: boolean }) {
  const first = tokenMeta(tokenX);
  const second = tokenMeta(tokenY);

  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <span className="flex shrink-0 items-center pl-1">
        <TokenIcon token={tokenX} className={cn('z-10', compact && 'size-7')} />
        <TokenIcon token={tokenY} className={cn('-ml-3', compact && 'size-7')} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{first.symbol} / {second.symbol}</span>
        {!compact ? <span className="mt-0.5 block truncate text-sm text-muted">{first.name} · {second.name}</span> : null}
      </span>
    </span>
  );
}
