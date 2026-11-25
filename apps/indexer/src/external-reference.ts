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
  return rows.flatMap(row => {
    if (!Array.isArray(row) || row.length < 5 || typeof row[0] !== 'number') return [];
    try {
      return [{
        timestamp: row[0] * 1_000,
        open: decimal(row[1]), high: decimal(row[2]), low: decimal(row[3]), close: decimal(row[4]),
      }];
    } catch {
      return [];
    }
  }).sort((a, b) => a.timestamp - b.timestamp);
}

export function aggregateExternalCandles(input: readonly ExternalCandle[]) {
  const output: Array<ExternalCandle & { interval: keyof typeof TARGET_INTERVALS }> = [];
  for (const [interval, milliseconds] of Object.entries(TARGET_INTERVALS) as Array<[keyof typeof TARGET_INTERVALS, number]>) {
    const buckets = new Map<number, ExternalCandle>();
    for (const candle of input) {
      const timestamp = Math.floor(candle.timestamp / milliseconds) * milliseconds;
      const existing = buckets.get(timestamp);
      buckets.set(timestamp, existing ? {
        timestamp,
        open: existing.open,
        high: Math.max(Number(existing.high), Number(candle.high)).toString(),
        low: Math.min(Number(existing.low), Number(candle.low)).toString(),
        close: candle.close,
      } : { ...candle, timestamp });
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
): Promise<ExternalCandle[]> {
  const url = new URL(`${GECKO_BASE_URL}/networks/robinhood/pools/${poolAddress}/ohlcv/minute`);
  url.searchParams.set('aggregate', '5');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('currency', 'token');
  url.searchParams.set('token', 'base');
  url.searchParams.set('include_empty_intervals', 'false');
  if (beforeTimestamp) url.searchParams.set('before_timestamp', String(beforeTimestamp));
  const response = await fetch(url, {
    headers: { accept: 'application/json;version=20230203', 'user-agent': 'Femeora reference indexer/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('EXTERNAL_REFERENCE_UNAVAILABLE');
  return parseGeckoCandles(await response.json() as GeckoResponse, baseAddress);
}

async function writeCandles(
  poolIds: readonly string[],
  candles: ReturnType<typeof aggregateExternalCandles>,
  sourceUpdatedAt: Date,
  stale: boolean,
) {
  let written = 0;
  for (const poolId of poolIds) {
    for (let offset = 0; offset < candles.length; offset += 100) {
      const batch = candles.slice(offset, offset + 100);
      await prisma.$transaction(batch.map(candle => prisma.referenceCandle.upsert({
        where: { poolId_interval_bucketStart: { poolId, interval: candle.interval, bucketStart: new Date(candle.timestamp) } },
        create: {
          poolId, interval: candle.interval, bucketStart: new Date(candle.timestamp),
          open: candle.open, high: candle.high, low: candle.low, close: candle.close,
          sourceType: 'GECKOTERMINAL', sourceUpdatedAt, stale,
        },
        update: {
          open: candle.open, high: candle.high, low: candle.low, close: candle.close,
          sourceType: 'GECKOTERMINAL', sourceUpdatedAt, stale,
        },
      })));
      written += batch.length;
    }
  }
  return written;
}

export async function refreshExternalReferenceCandles(chainId: number, now = new Date()): Promise<{ pools: number; candles: number }> {
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
          OR: [{ tokenX: source.tokenAddress }, { tokenY: source.tokenAddress }],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (latest && now.getTime() - latest.updatedAt.getTime() < 60_000) continue;
    const candidates = await prisma.pool.findMany({
      where: {
        chainId: source.chainId, canonical: true, quoteToken: { not: null },
        OR: [{ tokenX: source.tokenAddress }, { tokenY: source.tokenAddress }],
      },
      select: { id: true, tokenX: true, tokenY: true, quoteToken: true },
    });
    const matching = candidates.filter(pool => {
      const quote = pool.quoteToken?.toLowerCase();
      const base = quote === pool.tokenY.toLowerCase() ? pool.tokenX : pool.tokenY;
      return base.toLowerCase() === source.tokenAddress.toLowerCase();
    });
    if (matching.length === 0) continue;
    const values = await fetchGeckoCandles(source.feedAddress, source.tokenAddress, 64);
    if (values.length === 0) continue;
    const sourceUpdatedAt = new Date(values.at(-1)!.timestamp + FIVE_MINUTES_MS);
    const stale = now.getTime() - sourceUpdatedAt.getTime() > source.heartbeatSeconds * 2_000;
    candles += await writeCandles(matching.map(pool => pool.id), aggregateExternalCandles(values), sourceUpdatedAt, stale);
    pools += matching.length;
  }
  return { pools, candles };
}

export async function backfillExternalReferenceCandles(days = 30): Promise<{ pools: number; candles: number }> {
  const from = Date.now() - days * 86_400_000;
  const sources = await prisma.assetPriceSource.findMany({
    where: { enabled: true, sourceType: 'GECKOTERMINAL', feedAddress: { not: null } },
    orderBy: { priority: 'asc' },
  });
  let poolCount = 0;
  let written = 0;
  for (const source of sources) {
    if (!source.feedAddress) continue;
    const all: ExternalCandle[] = [];
    let before: number | undefined;
    while (true) {
      const page = await fetchGeckoCandles(source.feedAddress, source.tokenAddress, 1_000, before);
      if (page.length === 0) break;
      all.unshift(...page.filter(candle => candle.timestamp >= from));
      const oldest = page[0]!.timestamp;
      if (oldest <= from || page.length < 1_000) break;
      before = Math.floor(oldest / 1_000) - 1;
      await new Promise(resolve => setTimeout(resolve, 6_100));
    }
    const candidates = await prisma.pool.findMany({
      where: {
        chainId: source.chainId, canonical: true, quoteToken: { not: null },
        OR: [{ tokenX: source.tokenAddress }, { tokenY: source.tokenAddress }],
      },
      select: { id: true, tokenX: true, tokenY: true, quoteToken: true },
    });
    const matching = candidates.filter(pool => {
      const quote = pool.quoteToken?.toLowerCase();
      const base = quote === pool.tokenY.toLowerCase() ? pool.tokenX : pool.tokenY;
      return base.toLowerCase() === source.tokenAddress.toLowerCase();
    });
    if (all.length === 0 || matching.length === 0) continue;
    written += await writeCandles(
      matching.map(pool => pool.id),
      aggregateExternalCandles(all),
      new Date(all.at(-1)!.timestamp + FIVE_MINUTES_MS),
      false,
    );
    poolCount += matching.length;
  }
  return { pools: poolCount, candles: written };
}
