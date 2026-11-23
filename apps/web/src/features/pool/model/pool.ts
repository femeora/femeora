/**
 * Pool shown by the trade terminal. Replace with `GET /v1/pools/:pool` (brief 11)
 * once the API is live; components only depend on these shapes.
 */
export interface Pool {
  address: string;
  tokenX: string;
  tokenY: string;
  base: string;
  quote: string;
  chain: string;
  type: 'DLMM' | 'DAMM';
  /** Price step between bins, in basis points. */
  binStepBps: number;
  baseFeeBps: number;
  /** Circulating supply used to convert price to market cap. */
  supply: number;
  marketCapAvailable: boolean;
  priceUsd: number;
  change24hPct: number | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  fee24hUsd: number | null;
  age: string | null;
  activeBinId: number;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

/** Liquidity in one bin, as distance from the active bin and USD depth. */
export interface LiquidityBin {
  offset: number;
  depthUsd: number;
}
