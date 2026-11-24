import { PRICE_SCALE, priceFromBinX18, rawUnitsToDecimal } from '@fomeora/sdk';

import type { Pool } from './pool';

import type {
  ApiBin,
  ApiCandle,
  ApiLp,
  ApiPoolDetail,
  ApiPoolStats,
  ApiTrade,
} from '@/lib/api/types';
import { tokenSymbol } from '@/lib/tokens';

export interface LivePoolStats extends ApiPoolStats {
  counts: ApiPoolDetail['counts'];
}

export type LiveTrade = ApiTrade;
export type LiveLp = ApiLp;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function finiteNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * DLMM pools have an authoritative price before their first swap/candle: the
 * active-bin price. This keeps new pools usable without inventing market data.
 */
export function activeBinPrice(pool: ApiPoolDetail): number {
  if (pool.type !== 'DLMM' || pool.activeBin === null || pool.binStep <= 0) return 0;
  try {
    const tokenYPerTokenX = priceFromBinX18(pool.activeBin, pool.binStep);
    const baseIsTokenX = pool.baseIsTokenX
      ?? pool.quoteToken?.toLowerCase() === pool.tokenY.toLowerCase();
    const oriented = baseIsTokenX
      ? tokenYPerTokenX
      : PRICE_SCALE * PRICE_SCALE / tokenYPerTokenX;
    return finiteNumber(rawUnitsToDecimal(oriented, 18, 18));
  } catch {
    return 0;
  }
}

export function apiPoolToPool(pool: ApiPoolDetail, latest: ApiCandle | undefined): Pool {
  const latestPrice = latest ? finiteNumber(latest.close) : 0;
  return {
    address: pool.address,
    tokenX: pool.tokenX,
    tokenY: pool.tokenY,
    base: tokenSymbol(pool.tokenX),
    quote: tokenSymbol(pool.tokenY),
    chain: String(pool.chainId),
    type: pool.type,
    binStepBps: pool.binStep,
    baseFeeBps: pool.baseFeePips / 100,
    supply: 1,
    marketCapAvailable: false,
    priceUsd: latestPrice > 0 ? latestPrice : activeBinPrice(pool),
    change24hPct: null,
    tvlUsd: null,
    volume24hUsd: null,
    fee24hUsd: null,
    age: null,
    activeBinId: pool.activeBin ?? 0,
  };
}

export function apiCandlesToChart(candles: readonly ApiCandle[]) {
  return candles.flatMap(candle => {
    const open = finiteNumber(candle.open, Number.NaN);
    const high = finiteNumber(candle.high, Number.NaN);
    const low = finiteNumber(candle.low, Number.NaN);
    const close = finiteNumber(candle.close, Number.NaN);
    const volume = finiteNumber(candle.volumeQuote ?? candle.volumeY);
    const timestamp = Math.floor(new Date(candle.timestamp).getTime() / 1_000);
    return [open, high, low, close, timestamp].every(Number.isFinite)
      ? [{ open, high, low, close, volume, timestamp }]
      : [];
  });
}

export function apiBinsToLiquidity(bins: readonly ApiBin[], activeBin: number) {
  return bins.map(bin => ({
    offset: bin.binId - activeBin,
    priceQuote: bin.priceQuote === null ? null : finiteNumber(bin.priceQuote),
    depthUsd: bin.depthQuote === null ? 0 : Math.max(0, finiteNumber(bin.depthQuote)),
    side: bin.side,
  }));
}

export { shortAddress };
