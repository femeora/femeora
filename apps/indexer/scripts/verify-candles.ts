import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { rebuildTouchedCandles } = await import('../src/processors/candles.js');

const environment = loadIndexerEnvironment();
const hex = (bytes: number) => `0x${randomBytes(bytes).toString('hex')}`;
const timestamp = new Date('2026-11-23T10:07:31.000Z');
const tokenX = hex(20);
const tokenY = hex(20);
const firstHash = hex(32);
const secondHash = hex(32);
let poolId: string | null = null;

try {
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID,
      address: hex(20),
      type: 'DLMM',
      tokenX,
      tokenY,
      tokenXDecimals: 18,
      tokenYDecimals: 6,
      binStep: 25,
      baseFeePips: 3_000,
      createdBlock: 1n,
    },
  });
  poolId = pool.id;
  await prisma.swap.createMany({
    data: [
      {
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        transactionHash: firstHash,
        logIndex: 0,
        transactionIndex: 0,
        blockNumber: 1n,
        blockHash: hex(32),
        timestamp,
        sender: hex(20),
        recipient: hex(20),
        tokenIn: tokenX,
        amountIn: '1000000000000000000',
        amountOut: '2000000',
      },
      {
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        transactionHash: secondHash,
        logIndex: 0,
        transactionIndex: 0,
        blockNumber: 2n,
        blockHash: hex(32),
        timestamp,
        sender: hex(20),
        recipient: hex(20),
        tokenIn: tokenY,
        amountIn: '6000000',
        amountOut: '2000000000000000000',
      },
    ],
  });
  await prisma.$transaction(transaction => rebuildTouchedCandles(transaction, pool.id, [timestamp]));
  await prisma.$transaction(transaction => rebuildTouchedCandles(transaction, pool.id, [timestamp]));
  const initial = await prisma.candle.findMany({ where: { poolId: pool.id } });
  const minute = initial.find(candle => candle.interval === '1m');

  await prisma.swap.update({
    where: {
      chainId_transactionHash_logIndex: {
        chainId: environment.CHAIN_ID,
        transactionHash: secondHash,
        logIndex: 0,
      },
    },
    data: { canonical: false },
  });
  await prisma.$transaction(transaction => rebuildTouchedCandles(transaction, pool.id, [timestamp]));
  const rebuilt = await prisma.candle.findMany({ where: { poolId: pool.id } });
  const rebuiltMinute = rebuilt.find(candle => candle.interval === '1m');

  // The verifier prints booleans only; it never prints environment or database values.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    allSixIntervals: initial.length === 6,
    idempotentBucketCount: initial.length === 6,
    normalizedOhlc: minute?.open.toString() === '2' && minute.high.toString() === '3'
      && minute.low.toString() === '2' && minute.close.toString() === '3',
    directionalVolumes: minute?.volumeX.toString() === '3000000000000000000'
      && minute.volumeY.toString() === '8000000' && minute.swapCount === 2,
    canonicalRebuild: rebuilt.length === 6 && rebuiltMinute?.open.toString() === '2'
      && rebuiltMinute.close.toString() === '2' && rebuiltMinute.swapCount === 1,
  }));
} finally {
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  await prisma.$disconnect();
}
