import { prisma } from '@fomeora/database';

const GECKO_BASE_URL = 'https://api.geckoterminal.com/api/v2';
const FIVE_MINUTES_MS = 300_000;
const TARGET_INTERVALS = {
  '5m': FIVE_MINUTES_MS,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
} as const;

export interface ExternalCandle {
  readonly timestamp: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
}

interface GeckoResponse {
  data?: { attributes?: { ohlcv_list?: unknown } };
  meta?: { base?: { address?: string }; quote?: { address?: string } };
}

export function geckoReferenceCurrency(quoteCurrency: string): 'token' | 'usd' {
  return quoteCurrency.toUpperCase() === 'USD' ? 'usd' : 'token';
}

function decimal(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('EXTERNAL_REFERENCE_INVALID');
  }
  return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 });
}

export function parseGeckoCandles(payload: GeckoResponse, expectedBase: string): ExternalCandle[] {
  if (payload.meta?.base?.address?.toLowerCase() !== expectedBase.toLowerCase()) {
    throw new Error('EXTERNAL_REFERENCE_PAIR_MISMATCH');
  }
  const rows = payload.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error('EXTERNAL_REFERENCE_INVALID');
  return rows
    .flatMap(row => {
      if (!Array.isArray(row) || row.length < 5 || typeof row[0] !== 'number') return [];
      try {
        return [
          {
            timestamp: row[0] * 1_000,
            open: decimal(row[1]),
            high: decimal(row[2]),
            low: decimal(row[3]),
            close: decimal(row[4]),
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function aggregateExternalCandles(input: readonly ExternalCandle[]) {
  const output: Array<ExternalCandle & { interval: keyof typeof TARGET_INTERVALS }> = [];
  for (const [interval, milliseconds] of Object.entries(TARGET_INTERVALS) as Array<
    [keyof typeof TARGET_INTERVALS, number]
  >) {
    const buckets = new Map<number, ExternalCandle>();
    for (const candle of input) {
      const timestamp = Math.floor(candle.timestamp / milliseconds) * milliseconds;
      const existing = buckets.get(timestamp);
      buckets.set(
        timestamp,
        existing
          ? {
              timestamp,
              open: existing.open,
              high: Math.max(Number(existing.high), Number(candle.high)).toString(),
              low: Math.min(Number(existing.low), Number(candle.low)).toString(),
              close: candle.close,
            }
          : { ...candle, timestamp }
      );
    }
    output.push(...[...buckets.values()].map(candle => ({ ...candle, interval })));
  }
  return output.sort((a, b) => a.timestamp - b.timestamp || a.interval.localeCompare(b.interval));
}

export async function fetchGeckoCandles(
  poolAddress: string,
  baseAddress: string,
  limit: number,
  beforeTimestamp?: number,
  currency: 'token' | 'usd' = 'token'
): Promise<ExternalCandle[]> {
  const url = new URL(`${GECKO_BASE_URL}/networks/robinhood/pools/${poolAddress}/ohlcv/minute`);
  url.searchParams.set('aggregate', '5');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('currency', currency);
  url.searchParams.set('token', 'base');
  url.searchParams.set('include_empty_intervals', 'false');
  if (beforeTimestamp) url.searchParams.set('before_timestamp', String(beforeTimestamp));
  const response = await fetch(url, {
    headers: {
      accept: 'application/json;version=20230203',
      'user-agent': 'Femeora reference indexer/1.0',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('EXTERNAL_REFERENCE_UNAVAILABLE');
  return parseGeckoCandles((await response.json()) as GeckoResponse, baseAddress);
}

async function writeCandles(
  poolIds: readonly string[],
  candles: ReturnType<typeof aggregateExternalCandles>,
  sourceUpdatedAt: Date,
  stale: boolean
) {
  let written = 0;
  for (const poolId of poolIds) {
    for (let offset = 0; offset < candles.length; offset += 100) {
      const batch = candles.slice(offset, offset + 100);
      await prisma.$transaction(
        batch.map(candle =>
          prisma.referenceCandle.upsert({
            where: {
              poolId_interval_bucketStart: {
                poolId,
                interval: candle.interval,
                bucketStart: new Date(candle.timestamp),
              },
            },
            create: {
              poolId,
              interval: candle.interval,
              bucketStart: new Date(candle.timestamp),
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              sourceType: 'GECKOTERMINAL',
              sourceUpdatedAt,
              stale,
            },
            update: {
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              sourceType: 'GECKOTERMINAL',
              sourceUpdatedAt,
              stale,
            },
          })
        )
      );
      written += batch.length;
    }
  }
  return written;
}

async function writeHistoricalCandles(
  poolIds: readonly string[],
  candles: ReturnType<typeof aggregateExternalCandles>,
  sourceUpdatedAt: Date
) {
  let written = 0;
  for (const poolId of poolIds) {
    for (let offset = 0; offset < candles.length; offset += 500) {
      const batch = candles.slice(offset, offset + 500);
      const result = await prisma.referenceCandle.createMany({
        data: batch.map(candle => ({
          poolId,
          interval: candle.interval,
          bucketStart: new Date(candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          sourceType: 'GECKOTERMINAL',
          sourceUpdatedAt,
          stale: false,
        })),
        skipDuplicates: true,
      });
      written += result.count;
    }
  }
  return written;
}

async function matchingPools(source: { chainId: number; tokenAddress: string }) {
  const display = await prisma.assetDisplayConfig.findUnique({
    where: { chainId_address: { chainId: source.chainId, address: source.tokenAddress } },
    select: { candidateQuoteAddress: true },
  });
  const expectedQuote = display?.candidateQuoteAddress?.toLowerCase();
  if (!expectedQuote) return [];
  const candidates = await prisma.pool.findMany({
    where: {
      chainId: source.chainId,
      canonical: true,
      visible: true,
      OR: [{ tokenX: source.tokenAddress }, { tokenY: source.tokenAddress }],
    },
    select: { id: true, tokenX: true, tokenY: true, quoteToken: true },
  });
  const pools = candidates.filter(pool => {
    const other =
      pool.tokenX.toLowerCase() === source.tokenAddress.toLowerCase()
        ? pool.tokenY.toLowerCase()
        : pool.tokenX.toLowerCase();
    return other === expectedQuote;
  });
  await prisma.pool.updateMany({
    where: { id: { in: pools.map(pool => pool.id) }, quoteToken: null },
    data: { quoteToken: expectedQuote },
  });
  return pools;
}

export async function refreshExternalReferenceCandles(
  chainId: number,
  now = new Date()
): Promise<{ pools: number; candles: number }> {
  const sources = await prisma.assetPriceSource.findMany({
    where: { chainId, enabled: true, sourceType: 'GECKOTERMINAL', feedAddress: { not: null } },
    orderBy: { priority: 'asc' },
  });
  let pools = 0;
  let candles = 0;
  for (const source of sources) {
    if (!source.feedAddress) continue;
    const latest = await prisma.referenceCandle.findFirst({
      where: {
        sourceType: 'GECKOTERMINAL',
        pool: {
          chainId: source.chainId,
          visible: true,
          OR: [{ tokenX: source.tokenAddress }, { tokenY: source.tokenAddress }],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (latest && now.getTime() - latest.updatedAt.getTime() < 60_000) continue;
    const matching = await matchingPools(source);
    if (matching.length === 0) continue;
    const currency = geckoReferenceCurrency(source.quoteCurrency);
    const values = await fetchGeckoCandles(
      source.feedAddress,
      source.tokenAddress,
      64,
      undefined,
      currency
    );
    if (values.length === 0) continue;
    const sourceUpdatedAt = new Date(values.at(-1)!.timestamp + FIVE_MINUTES_MS);
    const stale = now.getTime() - sourceUpdatedAt.getTime() > source.heartbeatSeconds * 2_000;
    candles += await writeCandles(
      matching.map(pool => pool.id),
      aggregateExternalCandles(values),
      sourceUpdatedAt,
      stale
    );
    pools += matching.length;
  }
  return { pools, candles };
}

export async function backfillExternalReferenceCandles(
  days = 30,
  tokenAddress?: string
): Promise<{ pools: number; candles: number }> {
  const from = Date.now() - days * 86_400_000;
  const sources = await prisma.assetPriceSource.findMany({
    where: {
      enabled: true,
      sourceType: 'GECKOTERMINAL',
      feedAddress: { not: null },
      ...(tokenAddress ? { tokenAddress: tokenAddress.toLowerCase() } : {}),
    },
    orderBy: { priority: 'asc' },
  });
  let poolCount = 0;
  let written = 0;
  for (const source of sources) {
    if (!source.feedAddress) continue;
    const all: ExternalCandle[] = [];
    let before: number | undefined;
    while (true) {
      const currency = geckoReferenceCurrency(source.quoteCurrency);
      const page = await fetchGeckoCandles(
        source.feedAddress,
        source.tokenAddress,
        1_000,
        before,
        currency
      );
      if (page.length === 0) break;
      all.unshift(...page.filter(candle => candle.timestamp >= from));
      const oldest = page[0]!.timestamp;
      if (oldest <= from || page.length < 1_000) break;
      before = Math.floor(oldest / 1_000) - 1;
      await new Promise(resolve => setTimeout(resolve, 6_100));
    }
    const matching = await matchingPools(source);
    if (all.length === 0 || matching.length === 0) continue;
    written += await writeHistoricalCandles(
      matching.map(pool => pool.id),
      aggregateExternalCandles(all),
      new Date(all.at(-1)!.timestamp + FIVE_MINUTES_MS)
    );
    poolCount += matching.length;
  }
  return { pools: poolCount, candles: written };
}
