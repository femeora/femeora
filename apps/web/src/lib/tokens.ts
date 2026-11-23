export interface TokenMeta {
  symbol: string;
  name: string;
  logo: string | null;
}

const UNKNOWN_TOKEN: TokenMeta = { symbol: 'Token', name: 'Unverified token', logo: null };

const TOKENS_BY_ADDRESS: Readonly<Record<string, TokenMeta>> = {
  '0x8d949e9d5a2cd5d6dcfb27e461d3ac23aee5708c': {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    logo: '/tokens/weth.png',
  },
  '0x7e955252e15c84f5768b83c41a71f9eba181802f': {
    symbol: 'USDG',
    name: 'Global Dollar',
    logo: '/tokens/usdg.png',
  },
};

const TOKENS_BY_SYMBOL: Readonly<Record<string, TokenMeta>> = {
  ETH: { symbol: 'ETH', name: 'Ether', logo: '/tokens/eth.png' },
  WETH: TOKENS_BY_ADDRESS['0x8d949e9d5a2cd5d6dcfb27e461d3ac23aee5708c']!,
  USDG: TOKENS_BY_ADDRESS['0x7e955252e15c84f5768b83c41a71f9eba181802f']!,
};

export function tokenMeta(token: string): TokenMeta {
  return TOKENS_BY_ADDRESS[token.toLowerCase()] ?? TOKENS_BY_SYMBOL[token.toUpperCase()] ?? UNKNOWN_TOKEN;
}

export function tokenSymbol(token: string): string {
  const meta = tokenMeta(token);
  return meta === UNKNOWN_TOKEN ? `${token.slice(0, 6)}…${token.slice(-4)}` : meta.symbol;
}
