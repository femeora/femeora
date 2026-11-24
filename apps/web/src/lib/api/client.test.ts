import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiPoolStatsSchema } from '@fomeora/types';

import { BrowserApiError, browserApiRequest } from './client';

const validStats = {
  swapCount: 1,
  openPositions: 2,
  amountIn: '10.5',
  amountOut: '9',
  totalFee: '0.1',
  protocolFee: '0.01',
  reserveX: '500',
  reserveY: '800',
  reserveUpdatedBlock: '123',
  reserveUtilizationBps: 8000,
  reserveCapStatus: 'warning',
  change24hPct: '-4.5',
  tvlQuote: '123.45',
  volume24hQuote: '67.89',
  fee24hQuote: '0.12',
  createdAt: '2026-11-24T00:00:00.000Z',
};

test('browser API client uses only the same-origin proxy and validates responses', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async input => {
    requestedUrl = String(input);
    return Response.json(validStats);
  };

  try {
    assert.deepEqual(await browserApiRequest('/v1/pools/pool/stats', ApiPoolStatsSchema), validStats);
    assert.equal(requestedUrl, '/api/v1/pools/pool/stats');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser API client rejects malformed upstream data and non-v1 paths', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ...validStats, amountIn: 10.5 });

  try {
    await assert.rejects(
      browserApiRequest('/v1/pools/pool/stats', ApiPoolStatsSchema),
      (error: unknown) => error instanceof BrowserApiError && error.code === 'INVALID_API_RESPONSE',
    );
    await assert.rejects(
      browserApiRequest('https://attacker.invalid/v1/pools', ApiPoolStatsSchema),
      (error: unknown) => error instanceof BrowserApiError && error.code === 'INVALID_API_PATH',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
