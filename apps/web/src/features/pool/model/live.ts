import type {
  ApiBin,
  ApiCandle,
  ApiLp,
  ApiPoolDetail,
  ApiPoolStats,
  ApiTrade,
} from '@/lib/api/types';

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

export function apiPoolToPool(pool: ApiPoolDetail, latest: ApiCandle | undefined): Pool {
  return {
    address: pool.address,
    tokenX: pool.tokenX,
    tokenY: pool.tokenY,
    base: shortAddress(pool.tokenX),
    quote: shortAddress(pool.tokenY),
    chain: String(pool.chainId),
    type: pool.type,
    binStepBps: pool.binStep,
    baseFeeBps: pool.baseFeePips / 100,
    supply: 1,
    marketCapAvailable: false,
    priceUsd: latest ? finiteNumber(latest.close) : 0,
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
    const volume = finiteNumber(candle.volumeY);
    const timestamp = Math.floor(new Date(candle.timestamp).getTime() / 1_000);
    return [open, high, low, close, timestamp].every(Number.isFinite)
      ? [{ open, high, low, close, volume, timestamp }]
      : [];
  });
}

export function apiBinsToLiquidity(bins: readonly ApiBin[], activeBin: number) {
  return bins.map(bin => ({
    offset: bin.binId - activeBin,
    depthUsd: Math.max(0, finiteNumber(bin.reserveY)),
  }));
}

export { shortAddress };
