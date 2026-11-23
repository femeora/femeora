import { randomBytes, randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { rollupUserStats } = await import('../src/stats-rollup.js');

const environment = loadIndexerEnvironment();
const hex = (bytes: number) => `0x${randomBytes(bytes).toString('hex')}`;
const now = new Date('2026-11-23T12:00:00.000Z');
const userA = randomUUID();
const userB = randomUUID();
const positionA = BigInt(`0x1${randomBytes(6).toString('hex')}`);
const positionB = BigInt(`0x2${randomBytes(6).toString('hex')}`);
const oppositePosition = BigInt(`0x3${randomBytes(6).toString('hex')}`);
let poolId: string | null = null;

try {
  const walletA = hex(20);
  const walletB = hex(20);
  await prisma.user.createMany({
    data: [
      { id: userA, xId: `stats-a-${randomUUID()}`, handle: `stats_a_${randomBytes(4).toString('hex')}` },
      { id: userB, xId: `stats-b-${randomUUID()}`, handle: `stats_b_${randomBytes(4).toString('hex')}` },
    ],
  });
  await prisma.wallet.createMany({
    data: [
      { address: walletA, userId: userA, linkedAt: new Date(now.getTime() - 24 * 60 * 60 * 1_000) },
      { address: walletB, userId: userB, linkedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1_000) },
    ],
  });
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID,
      address: hex(20),
      type: 'DLMM',
      tokenX: hex(20),
      tokenY: hex(20),
      binStep: 25,
      baseFeePips: 3_000,
      initialActiveBin: 0,
      activeBin: 0,
      createdBlock: 1n,
    },
  });
  poolId = pool.id;
  await prisma.position.createMany({
    data: [
      { id: positionA, chainId: environment.CHAIN_ID, poolId: pool.id, owner: walletA, lowerBin: -1, upperBin: 1, shape: 0, status: 'open', depositedQuote: '100', valueQuote: '100', openedAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000) },
      { id: positionB, chainId: environment.CHAIN_ID, poolId: pool.id, owner: walletB, lowerBin: -1, upperBin: 1, shape: 0, status: 'open', depositedQuote: '100', valueQuote: '100', openedAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000) },
      { id: oppositePosition, chainId: environment.CHAIN_ID, poolId: pool.id, owner: walletA, lowerBin: 1, upperBin: 2, shape: 0, status: 'open', depositedQuote: '60', valueQuote: '60', openedAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000) },
    ],
  });
  const [calloutA, calloutB] = await Promise.all([
    prisma.callout.create({ data: { userId: userA, chainId: environment.CHAIN_ID, positionId: positionA, poolId: pool.id, sizeAtPost: '100', side: 'below', shape: 0, lowerBin: -1, upperBin: 1, status: 'live', createdAt: new Date(now.getTime() - 60 * 60 * 1_000) } }),
    prisma.callout.create({ data: { userId: userB, chainId: environment.CHAIN_ID, positionId: positionB, poolId: pool.id, sizeAtPost: '100', side: 'around', shape: 0, lowerBin: -1, upperBin: 1, status: 'live', createdAt: new Date(now.getTime() - 60 * 60 * 1_000) } }),
  ]);
  const quickExitEvent = await prisma.positionEvent.create({
    data: {
      chainId: environment.CHAIN_ID,
      transactionHash: hex(32),
      logIndex: 0,
      positionId: positionB,
      blockNumber: 2n,
      blockHash: hex(32),
      timestamp: new Date(calloutB.createdAt.getTime() + 10 * 60 * 1_000),
      eventType: 'decreased',
      payload: { bps: 5_000 },
    },
  });
  await prisma.calloutUpdate.create({
    data: { calloutId: calloutB.id, positionEventId: quickExitEvent.id, type: 'Removed' },
  });
  const accruals = await Promise.all([calloutA, calloutB].map((_, index) => prisma.binFeeAccrual.create({
    data: {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      transactionHash: hex(32),
      logIndex: index,
      transactionIndex: index,
      blockNumber: BigInt(10 + index),
      blockHash: hex(32),
      timestamp: new Date(now.getTime() - 30 * 60 * 1_000),
      binId: 0,
      tokenIn: pool.tokenX,
      lpFee: '100',
      totalShares: '100',
    },
  })));
  await prisma.positionFeeCredit.createMany({
    data: [
      { accrualId: accruals[0]!.id, chainId: environment.CHAIN_ID, positionId: positionA, poolId: pool.id, timestamp: accruals[0]!.timestamp, tokenIn: pool.tokenX, amountRaw: '10', amountQuote: '10' },
      { accrualId: accruals[1]!.id, chainId: environment.CHAIN_ID, positionId: positionB, poolId: pool.id, timestamp: accruals[1]!.timestamp, tokenIn: pool.tokenX, amountRaw: '20', amountQuote: '20' },
    ],
  });
  await prisma.indexerHealth.update({ where: { chainId: environment.CHAIN_ID }, data: { lastStatsRollupAt: null } });

  const first = await rollupUserStats(environment.CHAIN_ID, now);
  const beforeBoundary = await rollupUserStats(environment.CHAIN_ID, new Date(now.getTime() + 59_000));
  const atBoundary = await rollupUserStats(environment.CHAIN_ID, new Date(now.getTime() + 60_000));
  const [statsA, statsB, storedA, storedB] = await Promise.all([
    prisma.userStat.findUniqueOrThrow({ where: { userId_window: { userId: userA, window: '24h' } } }),
    prisma.userStat.findUniqueOrThrow({ where: { userId_window: { userId: userB, window: '24h' } } }),
    prisma.callout.findUniqueOrThrow({ where: { id: calloutA.id } }),
    prisma.callout.findUniqueOrThrow({ where: { id: calloutB.id } }),
  ]);
  const result = {
    fourWindowsPerUser: first.users >= 2 && first.rows >= 8,
    suppressedAt59Seconds: beforeBoundary.users === 0 && beforeBoundary.rows === 0,
    refreshedAt60Seconds: atBoundary.users >= 2 && atBoundary.rows >= 8,
    canonicalEarnedRolledUp: statsA.earnedQuote.toString() === '10' && statsB.earnedQuote.toString() === '20',
    quickExitExcludedAndCounted: statsB.quickExits === 1 && statsB.score.isZero() && storedB.quickExitMinutes === 10,
    deterministicRank: statsA.rank < statsB.rank,
    oppositeSideDetected: storedA.hasOppositeSide === true,
    freshWalletDetected: storedA.isFreshWallet === true && storedB.isFreshWallet === false,
    unknownProviderSignalPreserved: storedA.isDevOrTopHolder === null,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('STATS_ROLLUP_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'STATS_ROLLUP_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (poolId) {
    await prisma.callout.deleteMany({ where: { poolId } });
    await prisma.positionEvent.deleteMany({ where: { chainId: environment.CHAIN_ID, positionId: { in: [positionA, positionB, oppositePosition] } } });
    await prisma.positionFeeCredit.deleteMany({ where: { poolId } });
    await prisma.binFeeAccrual.deleteMany({ where: { poolId } });
    await prisma.position.deleteMany({ where: { poolId } });
    await prisma.pool.deleteMany({ where: { id: poolId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  try {
    await prisma.indexerHealth.update({ where: { chainId: environment.CHAIN_ID }, data: { lastStatsRollupAt: null } });
    await rollupUserStats(environment.CHAIN_ID, new Date(now.getTime() + 121_000));
  } catch {
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
