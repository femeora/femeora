import { getFomeoraDeployment } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { IndexerEnvironment } from '@fomeora/env';

import { backfillPoolRegistry } from './backfill.js';
import { createIndexerClient, type IndexerClient, verifyIndexerChain } from './chain-client.js';
import { refreshExternalReferenceCandles } from './external-reference.js';
import { reconcilePositionAccounting } from './position-accounting.js';
import { refreshReferenceCandles } from './reference-prices.js';
import { rollupLaunchpadReputation } from './reputation-rollup.js';
import { rollupUserStats } from './stats-rollup.js';
import { refreshPoolReserveSnapshots, refreshPositionValues } from './value-refresh.js';

const MAX_RETRY_DELAY_MS = 60_000;

export interface IndexerCycleResult {
  readonly chainId: number;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly safeBlock: bigint;
  readonly latestBlock: bigint;
  readonly lagBlocks: bigint;
  readonly batches: number;
  readonly pools: number;
  readonly bins: number;
  readonly binFees: number;
  readonly swaps: number;
  readonly positionEvents: number;
  readonly tailRewards: number;
  readonly valuePools: number;
  readonly valuePositions: number;
  readonly reservePools: number;
  readonly reserveWarnings: number;
  readonly reserveCritical: number;
  readonly referencePools: number;
  readonly referenceCandles: number;
  readonly statsUsers: number;
  readonly statsRows: number;
  readonly reputationLaunchpads: number;
  readonly reputationRows: number;
}

export function safeIndexerErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{2,19}$/.test(error.code)
  ) {
    return `DEPENDENCY_${error.code}`;
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(error.message)) {
    return error.message;
  }
  if (error instanceof Error) {
    const knownNames: Readonly<Record<string, string>> = {
      ContractFunctionExecutionError: 'CONTRACT_READ_FAILED',
      HttpRequestError: 'RPC_HTTP_FAILED',
      PrismaClientKnownRequestError: 'DATABASE_REQUEST_FAILED',
      PrismaClientUnknownRequestError: 'DATABASE_UNKNOWN_FAILED',
      TimeoutError: 'DEPENDENCY_TIMEOUT',
    };
    const known = knownNames[error.name];
    if (known) return known;
  }
  return 'INDEXER_CYCLE_FAILED';
}

export async function runIndexerCycle(
  environment: IndexerEnvironment,
  client: IndexerClient
): Promise<IndexerCycleResult> {
  const chain = await verifyIndexerChain(client, environment).catch(() => {
    throw new Error('INDEXER_CHAIN_VERIFICATION_FAILED');
  });
  const deployment = getFomeoraDeployment(environment.CHAIN_ID);
  const backfill = await backfillPoolRegistry(client, environment, chain, deployment).catch(
    error => {
      const code = safeIndexerErrorCode(error);
      throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'INDEXER_BACKFILL_FAILED' : code);
    }
  );
  await reconcilePositionAccounting(chain.chainId).catch(error => {
    const code = safeIndexerErrorCode(error);
    throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'POSITION_ACCOUNTING_FAILED' : code);
  });
  const valueRefresh = await refreshPositionValues(
    client,
    chain.chainId,
    chain.safeBlock,
    deployment
  ).catch(error => {
    const code = safeIndexerErrorCode(error);
    throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'POSITION_VALUE_REFRESH_FAILED' : code);
  });
  const reserveRefresh = await refreshPoolReserveSnapshots(
    client,
    chain.chainId,
    chain.safeBlock
  ).catch(error => {
    const code = safeIndexerErrorCode(error);
    throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'POOL_RESERVE_REFRESH_FAILED' : code);
  });
  const referenceRefresh = await refreshReferenceCandles(
    client,
    chain.chainId,
    chain.safeBlock
  ).catch(error => {
    const code = safeIndexerErrorCode(error);
    throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'REFERENCE_PRICE_REFRESH_FAILED' : code);
  });
  // External reference history improves charts but must never stop canonical
  // on-chain indexing when the public market-data provider is unavailable.
  const externalReferenceRefresh = await refreshExternalReferenceCandles(chain.chainId).catch(
    () => ({ pools: 0, candles: 0 })
  );
  const cursor = await prisma.chainCursor
    .findUniqueOrThrow({ where: { chainId: chain.chainId } })
    .catch(() => {
      throw new Error('INDEXER_CURSOR_READ_FAILED');
    });
  const lastIndexedBlock = cursor.lastProcessedBlock;
  const lagBlocks =
    lastIndexedBlock === null || chain.safeBlock <= lastIndexedBlock
      ? 0n
      : chain.safeBlock - lastIndexedBlock;
  await prisma.indexerHealth.upsert({
    where: { chainId: chain.chainId },
    create: {
      chainId: chain.chainId,
      status: 'healthy',
      latestBlock: chain.latestBlock,
      safeBlock: chain.safeBlock,
      lastIndexedBlock,
      lagBlocks,
      lastSuccessAt: new Date(),
    },
    update: {
      status: 'healthy',
      latestBlock: chain.latestBlock,
      safeBlock: chain.safeBlock,
      lastIndexedBlock,
      lagBlocks,
      lastSuccessAt: new Date(),
      lastErrorCode: null,
    },
  });
  const statsRollup = await rollupUserStats(chain.chainId).catch(error => {
    const code = safeIndexerErrorCode(error);
    throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'USER_STATS_ROLLUP_FAILED' : code);
  });
  const reputationRollup = await rollupLaunchpadReputation(chain.chainId).catch(error => {
    const code = safeIndexerErrorCode(error);
    throw new Error(code === 'INDEXER_CYCLE_FAILED' ? 'LAUNCHPAD_REPUTATION_ROLLUP_FAILED' : code);
  });
  return {
    chainId: chain.chainId,
    fromBlock: backfill.fromBlock,
    toBlock: backfill.toBlock,
    safeBlock: chain.safeBlock,
    latestBlock: chain.latestBlock,
    lagBlocks,
    batches: backfill.batches,
    pools: backfill.poolsDiscovered,
    bins: backfill.binsProjected,
    binFees: backfill.binFeesProjected,
    swaps: backfill.swapsProjected,
    positionEvents: backfill.positionEventsProjected,
    tailRewards: backfill.tailRewardsProjected,
    valuePools: valueRefresh.pools,
    valuePositions: valueRefresh.positions,
    reservePools: reserveRefresh.pools,
    reserveWarnings: reserveRefresh.warning,
    reserveCritical: reserveRefresh.critical,
    referencePools: referenceRefresh.pools + externalReferenceRefresh.pools,
    referenceCandles: referenceRefresh.candles + externalReferenceRefresh.candles,
    statsUsers: statsRollup.users,
    statsRows: statsRollup.rows,
    reputationLaunchpads: reputationRollup.launchpads,
    reputationRows: reputationRollup.rows,
  };
}

async function recordFailure(chainId: number, code: string): Promise<void> {
  await prisma.indexerHealth.upsert({
    where: { chainId },
    create: {
      chainId,
      status: 'error',
      latestBlock: 0n,
      safeBlock: 0n,
      lagBlocks: 0n,
      lastErrorCode: code,
    },
    update: { status: 'error', lastErrorCode: code },
  });
}

function waitForNextCycle(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

export async function runIndexerWorker(
  environment: IndexerEnvironment,
  signal: AbortSignal
): Promise<void> {
  const client = createIndexerClient(environment);
  let failures = 0;
  while (!signal.aborted) {
    try {
      const result = await runIndexerCycle(environment, client);
      failures = 0;
      // Contains public chain metrics only; no URLs, headers or credentials.
      // eslint-disable-next-line no-console
      console.info(
        `Fomeora Indexer healthy chain=${result.chainId} indexed=${result.toBlock} safe=${result.safeBlock} lag=${result.lagBlocks} batches=${result.batches} pools=${result.pools} bins=${result.bins} binFees=${result.binFees} swaps=${result.swaps} positions=${result.positionEvents} tailRewards=${result.tailRewards} valuePools=${result.valuePools} valuePositions=${result.valuePositions} reservePools=${result.reservePools} reserveWarnings=${result.reserveWarnings} reserveCritical=${result.reserveCritical} referencePools=${result.referencePools} referenceCandles=${result.referenceCandles} statsUsers=${result.statsUsers} statsRows=${result.statsRows} reputationLaunchpads=${result.reputationLaunchpads} reputationRows=${result.reputationRows}`
      );
      await waitForNextCycle(environment.INDEXER_POLL_INTERVAL_MS, signal);
    } catch (error) {
      failures += 1;
      const code = safeIndexerErrorCode(error);
      try {
        await recordFailure(environment.CHAIN_ID, code);
      } catch {
        // The database may be the failing dependency; never print its raw error.
      }
      // eslint-disable-next-line no-console
      console.error(`Fomeora Indexer cycle failed code=${code}`);
      const delay = Math.min(
        environment.INDEXER_POLL_INTERVAL_MS * 2 ** Math.min(failures, 6),
        MAX_RETRY_DELAY_MS
      );
      await waitForNextCycle(delay, signal);
    }
  }
}
