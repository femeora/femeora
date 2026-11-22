import type { Pool } from './pool';

export type SwapDirection = 'buy' | 'sell';

export interface SwapQuote {
  amountOut: number;
  feeUsd: number;
  priceImpactPct: number;
  minReceived: number;
}

/** Default slippage tolerance, in %. */
export const SLIPPAGE_PCT = 1;

/**
 * Rough constant-depth estimate for the demo terminal. The real quote comes from
 * the router; this only needs to react sensibly to input.
 */
export function quoteSwap(pool: Pool, direction: SwapDirection, amountIn: number): SwapQuote {
  const feeRate = pool.baseFeeBps / 10_000;
  const inUsd = direction === 'buy' ? amountIn : amountIn * pool.priceUsd;
  const priceImpactPct = Math.min(99, (inUsd / pool.tvlUsd) * 100);
  const effectiveUsd = inUsd * (1 - feeRate) * (1 - priceImpactPct / 100);
  const amountOut = direction === 'buy' ? effectiveUsd / pool.priceUsd : effectiveUsd;

  return {
    amountOut,
    feeUsd: inUsd * feeRate,
    priceImpactPct,
    minReceived: amountOut * (1 - SLIPPAGE_PCT / 100),
  };
}
