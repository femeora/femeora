import { PRICE_SCALE, priceFromBinX18, rawUnitsToDecimal } from '@fomeora/sdk';

import type {
  ApiBin,
  ApiCandle,
  ApiLp,
  ApiPoolDetail,
  ApiPoolStats,
  ApiTrade,
} from '@/lib/api/types';
import { tokenSymbol } from '@/lib/tokens';

import type { Pool } from './pool';

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

function poolAge(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const milliseconds = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const hours = Math.floor(milliseconds / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(milliseconds / 60_000))}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function apiPoolToPool(
  pool: ApiPoolDetail,
  latest: ApiCandle | undefined,
  stats?: ApiPoolStats,
): Pool {
  const latestPrice = latest ? finiteNumber(latest.close) : 0;
  const baseIsTokenX = pool.baseIsTokenX
    ?? pool.quoteToken?.toLowerCase() === pool.tokenY.toLowerCase();
  const baseAddress = baseIsTokenX ? pool.tokenX : pool.tokenY;
  const quoteAddress = baseIsTokenX ? pool.tokenY : pool.tokenX;
  return {
    address: pool.address,
    tokenX: pool.tokenX,
    tokenY: pool.tokenY,
    tokenXDecimals: pool.tokenXDecimals,
    tokenYDecimals: pool.tokenYDecimals,
    baseAddress,
    quoteAddress,
    baseIsTokenX,
    base: tokenSymbol(baseAddress),
    quote: tokenSymbol(quoteAddress),
    chain: String(pool.chainId),
    type: pool.type,
    binStepBps: pool.binStep,
    baseFeeBps: pool.baseFeePips / 100,
    supply: 1,
    marketCapAvailable: false,
    priceUsd: latestPrice > 0 ? latestPrice : activeBinPrice(pool),
    change24hPct: stats?.change24hPct === null || stats?.change24hPct === undefined
      ? null : finiteNumber(stats.change24hPct),
    tvlUsd: stats?.tvlQuote === null || stats?.tvlQuote === undefined
      ? null : finiteNumber(stats.tvlQuote),
    volume24hUsd: stats?.volume24hQuote === null || stats?.volume24hQuote === undefined
      ? null : finiteNumber(stats.volume24hQuote),
    fee24hUsd: stats?.fee24hQuote === null || stats?.fee24hQuote === undefined
      ? null : finiteNumber(stats.fee24hQuote),
    age: poolAge(stats?.createdAt),
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
      ? [{
          open, high, low, close, volume, timestamp, source: candle.source ?? 'pool',
          ...(candle.stale !== undefined ? { stale: candle.stale } : {}),
        }]
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
