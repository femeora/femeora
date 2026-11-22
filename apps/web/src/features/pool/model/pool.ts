import { seededRandom } from '@/lib/bins';

/**
 * Pool shown by the trade terminal. Replace with `GET /v1/pools/:pool` (brief 11)
 * once the API is live; components only depend on these shapes.
 */
export interface Pool {
  base: string;
  quote: string;
  chain: string;
  type: 'DLMM' | 'DAMM';
  /** Price step between bins, in basis points. */
  binStepBps: number;
  baseFeeBps: number;
  /** Circulating supply used to convert price to market cap. */
  supply: number;
  priceUsd: number;
  change24hPct: number;
  tvlUsd: number;
  volume24hUsd: number;
  fee24hUsd: number;
  age: string;
  activeBinId: number;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Liquidity in one bin, as distance from the active bin and USD depth. */
export interface LiquidityBin {
  offset: number;
  depthUsd: number;
}

export const featuredPool: Pool = {
  base: 'HOODIE',
  quote: 'USDG',
  chain: 'Robinhood Chain',
  type: 'DLMM',
  binStepBps: 100,
  baseFeeBps: 100,
  supply: 1_000_000_000,
  priceUsd: 0.004893,
  change24hPct: 12.4,
  tvlUsd: 812_400,
  volume24hUsd: 2_310_000,
  fee24hUsd: 23_100,
  age: '3d 4h',
  activeBinId: 8_388_618,
};

/** Deterministic random-walk candles that end exactly at `lastClose`. */
export function buildCandles(count: number, lastClose: number, seed = 11): Candle[] {
  const random = seededRandom(seed);
  const closes: number[] = [lastClose];
  for (let i = 1; i < count; i++) {
    const previous = closes[i - 1] ?? lastClose;
    closes.push(previous / (1 + (random() - 0.48) * 0.05));
  }
  closes.reverse();

  return closes.map((close, i) => {
    const open = closes[i - 1] ?? close * (1 - 0.01);
    const wick = Math.abs(close - open) * (0.4 + random());
    return {
      open,
      close,
      high: Math.max(open, close) + wick * random(),
      low: Math.min(open, close) - wick * random(),
      volume: 2_000 + random() * 28_000 * (1 + (Math.abs(close - open) / open) * 20),
    };
  });
}

/** Deterministic pool liquidity around the active bin. */
export function buildLiquidity(halfWidth: number, seed = 5): LiquidityBin[] {
  const random = seededRandom(seed);
  return Array.from({ length: halfWidth * 2 + 1 }, (_, i) => {
    const offset = i - halfWidth;
    const falloff = 1 - Math.abs(offset) / (halfWidth + 1);
    return { offset, depthUsd: Math.round((0.25 + falloff * 0.75) * (4_000 + random() * 9_000)) };
  });
}
