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
const SECONDARY_REQUEST_TIMEOUT_MS = 8_000;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [150, 450] as const;

export class FomeoraApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'FomeoraApiError';
  }
}

async function request<T>(path: string, schema: ZodType<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const { API_BASE_URL } = loadWebEnvironment();
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(new URL(path, API_BASE_URL), {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (TRANSIENT_STATUSES.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw new FomeoraApiError(response.status, payload?.error ?? 'API_REQUEST_FAILED');
      }
      const payload: unknown = await response.json().catch(() => {
        throw new FomeoraApiError(502, 'INVALID_API_RESPONSE');
      });
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new FomeoraApiError(502, 'INVALID_API_RESPONSE');
      return parsed.data;
    } catch (error) {
      if (error instanceof FomeoraApiError) throw error;
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

export const getPools = (limit = 50) =>
  request(`/v1/pools?limit=${limit}`, apiListSchema(ApiPoolSchema));

export const getPoolAssets = () => request('/v1/pool-assets', ApiPoolAssetListSchema);

export const getPool = (address: string) =>
  request(`/v1/pools/${encodeURIComponent(address)}`, ApiPoolDetailSchema);

export const getPoolStats = (address: string) =>
  request(`/v1/pools/${encodeURIComponent(address)}/stats`, ApiPoolStatsSchema, SECONDARY_REQUEST_TIMEOUT_MS);

export const getPoolCandles = (address: string, interval: string, limit: number, source: 'pool' | 'reference' | 'combined' = 'combined') =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/candles?interval=${encodeURIComponent(interval)}&limit=${limit}&source=${source}`,
    apiListSchema(ApiCandleSchema), SECONDARY_REQUEST_TIMEOUT_MS,
  );

export const getPoolBins = (address: string, from: number, to: number) =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/bins?from=${from}&to=${to}`,
    apiListSchema(ApiBinSchema), SECONDARY_REQUEST_TIMEOUT_MS,
  );

export const getPoolTrades = (address: string, limit = 50) =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/trades?limit=${limit}`,
    apiListSchema(ApiTradeSchema), SECONDARY_REQUEST_TIMEOUT_MS,
  );

export const getPoolLps = (address: string, limit = 50) =>
  request(`/v1/pools/${encodeURIComponent(address)}/lps?limit=${limit}`, apiListSchema(ApiLpSchema), SECONDARY_REQUEST_TIMEOUT_MS);

export const getPoolCallouts = (address: string, limit = 50) =>
  request(
    `/v1/pools/${encodeURIComponent(address)}/callouts?limit=${limit}`,
    apiListSchema(ApiCalloutSchema), SECONDARY_REQUEST_TIMEOUT_MS,
  );
