import { prisma } from '@fomeora/database';
import { loadIndexerEnvironment } from '@fomeora/env';
import type { Address } from 'viem';

import { createIndexerClient, verifyIndexerChain, type IndexerClient } from './chain-client.js';
import {
  buildHistoricalReferenceCandles,
  type ReferenceObservation,
} from './reference-prices.js';

const PHASE_OFFSET = 64n;
const ROUND_MASK = (1n << PHASE_OFFSET) - 1n;
const DEFAULT_DAYS = 30;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_DELAY_MS = 200;

const aggregatorV3Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [],
    outputs: [
      { type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' },
    ],
  },
  {
    type: 'function', name: 'getRoundData', stateMutability: 'view', inputs: [{ type: 'uint80' }],
    outputs: [
      { type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' },
    ],
  },
] as const;

function numericArgument(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`INVALID_${name.toUpperCase().replaceAll('-', '_')}`);
  return parsed;
}

function proxyRoundId(phase: bigint, aggregatorRound: bigint): bigint {
  return (phase << PHASE_OFFSET) | aggregatorRound;
}

function decodeProxyRoundId(roundId: bigint): { phase: bigint; aggregatorRound: bigint } {
  return { phase: roundId >> PHASE_OFFSET, aggregatorRound: roundId & ROUND_MASK };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function readRound(
  client: IndexerClient,
  address: Address,
  roundId: bigint,
): Promise<ReferenceObservation | null> {
  try {
    const round = await client.readContract({
      address,
      abi: aggregatorV3Abi,
      functionName: 'getRoundData',
      args: [roundId],
    });
    if (round[1] <= 0n || round[3] === 0n) return null;
    return { answer: round[1], updatedAt: new Date(Number(round[3]) * 1_000) };
  } catch {
    return null;
  }
}

async function findLastRoundInPhase(
  client: IndexerClient,
  address: Address,
  phase: bigint,
): Promise<bigint> {
  let valid = 1n;
  let invalid = 2n;
  if (!(await readRound(client, address, proxyRoundId(phase, valid)))) return 0n;
  while (await readRound(client, address, proxyRoundId(phase, invalid))) {
    valid = invalid;
    invalid *= 2n;
  }
  while (invalid - valid > 1n) {
    const middle = (valid + invalid) / 2n;
    if (await readRound(client, address, proxyRoundId(phase, middle))) valid = middle;
    else invalid = middle;
  }
  return valid;
}

async function fetchHistory(
  client: IndexerClient,
  address: Address,
  from: Date,
  batchSize: number,
  delayMs: number,
): Promise<{ decimals: number; observations: ReferenceObservation[] }> {
  const [decimals, latest] = await Promise.all([
    client.readContract({ address, abi: aggregatorV3Abi, functionName: 'decimals' }),
    client.readContract({ address, abi: aggregatorV3Abi, functionName: 'latestRoundData' }),
  ]);
  const latestId = latest[0];
  let { phase, aggregatorRound } = decodeProxyRoundId(latestId);
  if (phase === 0n) {
    phase = 0n;
    aggregatorRound = latestId;
  }
  const observations: ReferenceObservation[] = [];
  let reachedFrom = false;

  while (aggregatorRound > 0n && !reachedFrom) {
    const first = aggregatorRound > BigInt(batchSize) ? aggregatorRound - BigInt(batchSize) + 1n : 1n;
    const ids: bigint[] = [];
    for (let round = aggregatorRound; round >= first; round -= 1n) ids.push(proxyRoundId(phase, round));
    const values = await Promise.all(ids.map(id => readRound(client, address, id)));
    for (const value of values) {
      if (!value) continue;
      observations.push(value);
      if (value.updatedAt <= from) reachedFrom = true;
    }
    if (reachedFrom) break;
    if (first > 1n) aggregatorRound = first - 1n;
    else if (phase > 1n) {
      phase -= 1n;
      aggregatorRound = await findLastRoundInPhase(client, address, phase);
    } else break;
    await wait(delayMs);
  }

  return {
    decimals,
    observations: observations.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()),
  };
}

async function main(): Promise<void> {
  const days = numericArgument('days', DEFAULT_DAYS);
  const batchSize = Math.min(numericArgument('batch-size', DEFAULT_BATCH_SIZE), 50);
  const delayMs = numericArgument('delay-ms', DEFAULT_DELAY_MS);
  const environment = loadIndexerEnvironment();
  const client = createIndexerClient(environment);
  await verifyIndexerChain(client, environment);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const sources = await prisma.assetPriceSource.findMany({
    where: { chainId: environment.CHAIN_ID, enabled: true, sourceType: 'CHAINLINK', feedAddress: { not: null } },
    orderBy: { priority: 'asc' },
  });
  const sourceByToken = new Map(sources.map(source => [source.tokenAddress.toLowerCase(), source]));
  const pools = await prisma.pool.findMany({
    where: {
      chainId: environment.CHAIN_ID,
      canonical: true,
      quoteToken: { not: null },
    },
    select: { id: true, address: true, tokenX: true, tokenY: true, quoteToken: true },
  }).then(rows => rows.filter(pool => (
    sourceByToken.has(pool.tokenX.toLowerCase()) && sourceByToken.has(pool.tokenY.toLowerCase())
  )));
  const historyByFeed = new Map<string, Awaited<ReturnType<typeof fetchHistory>>>();
  for (const source of sources) {
    if (!source.feedAddress || historyByFeed.has(source.feedAddress)) continue;
    // Public progress only. Feed addresses and RPC configuration are deliberately omitted.
    // eslint-disable-next-line no-console
    console.info(`Reference history source=${source.symbol} status=fetching days=${days}`);
    const history = await fetchHistory(client, source.feedAddress as Address, from, batchSize, delayMs);
    historyByFeed.set(source.feedAddress, history);
    // eslint-disable-next-line no-console
    console.info(`Reference history source=${source.symbol} observations=${history.observations.length}`);
  }

  let written = 0;
  for (const pool of pools) {
    const xSource = sourceByToken.get(pool.tokenX.toLowerCase());
    const ySource = sourceByToken.get(pool.tokenY.toLowerCase());
    if (!xSource?.feedAddress || !ySource?.feedAddress) continue;
    const x = historyByFeed.get(xSource.feedAddress);
    const y = historyByFeed.get(ySource.feedAddress);
    if (!x || !y) continue;
    const quoteIsY = pool.quoteToken?.toLowerCase() === pool.tokenY.toLowerCase();
    const base = quoteIsY ? x : y;
    const quote = quoteIsY ? y : x;
    const candles = buildHistoricalReferenceCandles(
      base.observations,
      base.decimals,
      quote.observations,
      quote.decimals,
      from,
      to,
    );
    for (let offset = 0; offset < candles.length; offset += 100) {
      const batch = candles.slice(offset, offset + 100);
      await prisma.$transaction(batch.map(candle => prisma.referenceCandle.upsert({
        where: {
          poolId_interval_bucketStart: {
            poolId: pool.id,
            interval: candle.interval,
            bucketStart: candle.bucketStart,
          },
        },
        create: {
          poolId: pool.id,
          ...candle,
          sourceType: 'CHAINLINK',
          stale: false,
        },
        update: {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          sourceUpdatedAt: candle.sourceUpdatedAt,
          sourceType: 'CHAINLINK',
          stale: false,
        },
      })));
      written += batch.length;
    }
    // eslint-disable-next-line no-console
    console.info(`Reference history pool=${pool.address} candles=${candles.length}`);
  }
  // eslint-disable-next-line no-console
  console.info(`Reference history complete chain=${environment.CHAIN_ID} days=${days} pools=${pools.length} candles=${written}`);
}

try {
  await main();
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(error.message)
    ? error.message
    : 'REFERENCE_HISTORY_BACKFILL_FAILED';
  // eslint-disable-next-line no-console
  console.error(`Reference history failed code=${code}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
