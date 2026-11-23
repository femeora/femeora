import { randomBytes } from 'node:crypto';

import type { IndexerClient } from '../src/chain-client.js';

process.env.NODE_ENV = 'test';
const { getFomeoraDeployment } = await import('@fomeora/contracts-sdk');
const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { refreshPositionValues } = await import('../src/value-refresh.js');

const environment = loadIndexerEnvironment();
const suffix = randomBytes(20).toString('hex');
const poolAddress = `0x${suffix}`;
const tokenX = `0x${randomBytes(20).toString('hex')}`;
const tokenY = `0x${randomBytes(20).toString('hex')}`;
const positionId = BigInt(`9${Date.now()}`);
const safeBlock = 123_456n;
const firstRefresh = new Date('2026-11-23T00:00:00.000Z');
let poolId: string | null = null;

const client = {
  getBlock: async () => ({ timestamp: 1_795_392_000n }),
} as unknown as IndexerClient;

try {
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID,
      address: poolAddress,
      type: 'DLMM',
      tokenX,
      tokenY,
      tokenXDecimals: 6,
      tokenYDecimals: 6,
      quoteToken: tokenY,
      binStep: 1,
      baseFeePips: 3_000,
      initialActiveBin: 0,
      activeBin: 0,
      createdBlock: safeBlock,
    },
  });
  poolId = pool.id;
  await prisma.bin.create({
    data: {
      poolId: pool.id,
      binId: 0,
      reserveX: '1000000',
      reserveY: '2000000',
      totalShares: '100',
      updatedBlock: safeBlock,
    },
  });
  await prisma.position.create({
    data: {
      id: positionId,
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      owner: `0x${randomBytes(20).toString('hex')}`,
      lowerBin: 0,
      upperBin: 0,
      shape: 0,
      status: 'open',
      openedAt: firstRefresh,
      bins: {
        create: {
          poolId: pool.id,
          binId: 0,
          shares: '50',
        },
      },
    },
  });

  const deployment = getFomeoraDeployment(environment.CHAIN_ID);
  const first = await refreshPositionValues(client, environment.CHAIN_ID, safeBlock, deployment, firstRefresh);
  const beforeBoundary = await refreshPositionValues(
    client,
    environment.CHAIN_ID,
    safeBlock,
    deployment,
    new Date(firstRefresh.getTime() + 29_000),
  );
  const atBoundary = await refreshPositionValues(
    client,
    environment.CHAIN_ID,
    safeBlock,
    deployment,
    new Date(firstRefresh.getTime() + 30_000),
  );
  const position = await prisma.position.findUniqueOrThrow({
    where: { chainId_id: { chainId: environment.CHAIN_ID, id: positionId } },
  });
  const result = {
    firstRefresh: first.pools === 1 && first.positions === 1,
    suppressedAt29Seconds: beforeBoundary.pools === 0 && beforeBoundary.positions === 0,
    refreshedAt30Seconds: atBoundary.pools === 1 && atBoundary.positions === 1,
    exactQuoteValue: position.valueQuote?.toString() === '1.5',
    safeBlockRecorded: position.valueQuoteBlock === safeBlock,
  };
  // Contains booleans only; no generated addresses or infrastructure configuration.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('POSITION_VALUE_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'POSITION_VALUE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (poolId) {
    await prisma.positionBin.deleteMany({ where: { poolId } });
    await prisma.position.deleteMany({ where: { poolId } });
    await prisma.bin.deleteMany({ where: { poolId } });
    await prisma.pool.deleteMany({ where: { id: poolId } });
  }
  await prisma.$disconnect();
}
