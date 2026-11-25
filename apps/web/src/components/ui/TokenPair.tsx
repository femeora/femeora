import { cn } from '@/lib/cn';
import { tokenMeta } from '@/lib/tokens';

export function TokenIcon({ token, className, logoUrl, name }: {
  token: string;
  className?: string | undefined;
  logoUrl?: string | null | undefined;
  name?: string | undefined;
}) {
  const meta = tokenMeta(token);
  const resolvedLogo = logoUrl ?? meta.logo;
  const resolvedName = name ?? meta.name;
  return (
    <span
      className={cn(
        'relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-fg/15 bg-panel-2 shadow-[0_3px_14px_rgb(0_0_0/0.32)]',
        className,
      )}
    >
      {resolvedLogo ? (
        <img src={resolvedLogo} alt={`${resolvedName} logo`} className="size-full rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="size-3 rounded-full border border-fg/50 shadow-[0_0_0_4px_rgb(var(--fg)/0.08)]" />
      )}
    </span>
  );
}

export function TokenPair({ tokenX, tokenY, compact = false, tokenXIdentity, tokenYIdentity }: {
  tokenX: string;
  tokenY: string;
  compact?: boolean;
  tokenXIdentity?: { symbol: string; name?: string | undefined; logoUrl?: string | null | undefined };
  tokenYIdentity?: { symbol: string; name?: string | undefined; logoUrl?: string | null | undefined };
}) {
  const first = tokenMeta(tokenX);
  const second = tokenMeta(tokenY);
  const firstSymbol = tokenXIdentity?.symbol ?? first.symbol;
  const secondSymbol = tokenYIdentity?.symbol ?? second.symbol;
  const firstName = tokenXIdentity?.name ?? first.name;
  const secondName = tokenYIdentity?.name ?? second.name;

  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <span className="flex shrink-0 items-center pl-1">
        <TokenIcon token={tokenX} logoUrl={tokenXIdentity?.logoUrl} name={firstName} className={cn('z-10', compact && 'size-7')} />
        <TokenIcon token={tokenY} logoUrl={tokenYIdentity?.logoUrl} name={secondName} className={cn('-ml-3', compact && 'size-7')} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{firstSymbol} / {secondSymbol}</span>
        {!compact ? <span className="mt-0.5 block truncate text-sm text-muted">{firstName} · {secondName}</span> : null}
      </span>
    </span>
  );
}
