import 'server-only';

import { loadWebEnvironment } from '@fomeora/env';
import {
  ApiBinSchema,
  ApiCalloutSchema,
  ApiCandleSchema,
  ApiLpSchema,
  ApiPoolDetailSchema,
  ApiPoolAssetListSchema,
  ApiPoolSchema,
  ApiPoolStatsSchema,
  ApiTradeSchema,
  apiListSchema,
} from '@fomeora/types';
import type { ZodType } from 'zod';

const REQUEST_TIMEOUT_MS = 8_000;

export class FomeoraApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'FomeoraApiError';
  }
}

async function request<T>(path: string, schema: ZodType<T>): Promise<T> {
  const { API_BASE_URL } = loadWebEnvironment();
  const response = await fetch(new URL(path, API_BASE_URL), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new FomeoraApiError(response.status, payload?.error ?? 'API_REQUEST_FAILED');
  }
  const payload: unknown = await response.json().catch(() => {
    throw new FomeoraApiError(502, 'INVALID_API_RESPONSE');
  });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new FomeoraApiError(502, 'INVALID_API_RESPONSE');
  return parsed.data;
}

export const getPools = (limit = 50) =>
  request(`/v1/pools?limit=${limit}`, apiListSchema(ApiPoolSchema));

export const getPoolAssets = () => request('/v1/pool-assets', ApiPoolAssetListSchema);

export const getPool = (address: string) =>
  request(`/v1/pools/${encodeURIComponent(address)}`, ApiPoolDetailSchema);

export const getPoolStats = (address: string) =>
  request(`/v1/pools/${encodeURIComponent(address)}/stats`, ApiPoolStatsSchema);

export const getPoolCandles = (address: string, interval: string, limit: number, source: 'pool' | 'reference' | 'combined' = 'combined') =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/candles?interval=${encodeURIComponent(interval)}&limit=${limit}&source=${source}`,
    apiListSchema(ApiCandleSchema),
  );

export const getPoolBins = (address: string, from: number, to: number) =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/bins?from=${from}&to=${to}`,
    apiListSchema(ApiBinSchema),
  );

export const getPoolTrades = (address: string, limit = 50) =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/trades?limit=${limit}`,
    apiListSchema(ApiTradeSchema),
  );

export const getPoolLps = (address: string, limit = 50) =>
  request(`/v1/pools/${encodeURIComponent(address)}/lps?limit=${limit}`, apiListSchema(ApiLpSchema));

export const getPoolCallouts = (address: string, limit = 50) =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/callouts?limit=${limit}`,
    apiListSchema(ApiCalloutSchema),
  );
