import { cn } from '@/lib/cn';

interface TokenMeta {
  symbol: string;
  name: string;
  mark: string;
}

const TOKENS: Readonly<Record<string, TokenMeta>> = {
  '0x8d949e9d5a2cd5d6dcfb27e461d3ac23aee5708c': {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    mark: 'Ξ',
  },
  '0x7e955252e15c84f5768b83c41a71f9eba181802f': {
    symbol: 'USDG',
    name: 'Global Dollar',
    mark: '$',
  },
};

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function tokenMeta(address: string): TokenMeta {
  return TOKENS[address.toLowerCase()] ?? {
    symbol: short(address),
    name: 'Unverified token',
    mark: '?',
  };
}

function TokenLogo({ token, className }: { token: TokenMeta; className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full border border-fg/15 bg-gradient-to-br from-fg/20 to-panel font-mono text-xs font-semibold shadow-[0_3px_14px_rgb(0_0_0/0.32)]',
        className,
      )}
    >
      {token.mark}
    </span>
  );
}

export function TokenPair({ tokenX, tokenY, compact = false }: { tokenX: string; tokenY: string; compact?: boolean }) {
  const first = tokenMeta(tokenX);
  const second = tokenMeta(tokenY);

  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <span className="flex shrink-0 items-center pl-1">
        <TokenLogo token={first} className={compact ? 'size-7 text-[0.625rem]' : undefined} />
        <TokenLogo token={second} className={cn('-ml-2', compact ? 'size-7 text-[0.625rem]' : undefined)} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{first.symbol} / {second.symbol}</span>
        {!compact ? <span className="mt-0.5 block truncate text-sm text-muted">{first.name} · {second.name}</span> : null}
      </span>
    </span>
  );
}
