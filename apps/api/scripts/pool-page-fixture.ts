process.env.NODE_ENV = 'test';
const { prisma } = await import('@fomeora/database');
const { loadApiEnvironment } = await import('@fomeora/env');

const environment = loadApiEnvironment();
const mode = process.argv[2];
const poolAddress = '0x000000000000000000000000000000000000c011';
const tokenX = '0x000000000000000000000000000000000000c012';
const tokenY = '0x000000000000000000000000000000000000c013';
const owner = '0x000000000000000000000000000000000000c014';
const userId = '00000000-0000-4000-8000-00000000c011';
const positionId = 90_001n;
const transactionHash = `0x${'c0'.repeat(32)}`;
const blockHash = `0x${'b0'.repeat(32)}`;
const timestamp = new Date('2026-11-23T12:00:00.000Z');

async function cleanup(): Promise<void> {
  await prisma.$transaction(async transaction => {
    const pool = await transaction.pool.findFirst({
      where: { chainId: environment.CHAIN_ID, address: poolAddress },
      select: { id: true },
    });
    if (pool) {
      await transaction.callout.deleteMany({ where: { poolId: pool.id } });
      await transaction.positionEvent.deleteMany({
        where: { chainId: environment.CHAIN_ID, positionId },
      });
      await transaction.position.deleteMany({
        where: { chainId: environment.CHAIN_ID, id: positionId },
      });
      await transaction.swap.deleteMany({ where: { poolId: pool.id } });
      await transaction.candle.deleteMany({ where: { poolId: pool.id } });
      await transaction.bin.deleteMany({ where: { poolId: pool.id } });
      await transaction.pool.delete({ where: { id: pool.id } });
    }
    await transaction.user.deleteMany({ where: { id: userId } });
  });
}

try {
  await cleanup();
  if (mode === 'seed') {
    const user = await prisma.user.create({
      data: {
        id: userId,
        xId: 'pool-page-fixture',
        handle: 'canonical_lp',
        name: 'Canonical LP',
        xVerified: true,
      },
    });
    const pool = await prisma.pool.create({
      data: {
        chainId: environment.CHAIN_ID,
        address: poolAddress,
        type: 'DLMM',
        tokenX,
        tokenY,
        tokenXDecimals: 18,
        tokenYDecimals: 6,
        quoteToken: tokenY,
        binStep: 100,
        baseFeePips: 3_000,
        initialActiveBin: 0,
        activeBin: 0,
        createdBlock: 1n,
      },
    });
    await prisma.bin.createMany({
      data: [-1, 0, 1].map(binId => ({
        poolId: pool.id,
        binId,
        reserveX: '1000000000000000000',
        reserveY: '1000000',
        totalShares: '1000000000000000000',
        updatedBlock: 2n,
      })),
    });
    await prisma.swap.create({
      data: {
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        transactionHash,
        logIndex: 0,
        transactionIndex: 0,
        blockNumber: 2n,
        blockHash,
        timestamp,
        sender: owner,
        recipient: owner,
        tokenIn: tokenX,
        amountIn: '1000000000000000000',
        amountOut: '1000000',
        totalFee: '3000',
        protocolFee: '300',
        activeBinBefore: 0,
        activeBinAfter: 0,
        binCrossings: 1,
      },
    });
    await prisma.candle.createMany({
      data: ['5m', '15m', '1h', '4h'].map(interval => ({
        poolId: pool.id,
        interval,
        bucketStart: timestamp,
        open: '1',
        high: '1.01',
        low: '0.99',
        close: '1',
        volumeX: '1000000000000000000',
        volumeY: '1000000',
        swapCount: 1,
      })),
    });
    await prisma.position.create({
      data: {
        id: positionId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        owner,
        lowerBin: -1,
        upperBin: 1,
        shape: 2,
        status: 'open',
        depositedQuote: '10',
        earnedQuote: '1.25',
        valueQuote: '12.5',
        inRangeSeconds: 5_400n,
        openSeconds: 7_200n,
        openedAt: new Date(timestamp.getTime() - 7_200_000),
      },
    });
    await prisma.callout.create({
      data: {
        userId: user.id,
        chainId: environment.CHAIN_ID,
        positionId,
        poolId: pool.id,
        caption: 'Canonical range from the API.',
        showSize: true,
        priceAtPost: '0.9',
        sizeAtPost: '10',
        side: 'around',
        shape: 2,
        lowerBin: -1,
        upperBin: 1,
        createdAt: new Date(timestamp.getTime() - 1_800_000),
        status: 'live',
        hasOppositeSide: true,
        isFreshWallet: null,
        isDevOrTopHolder: null,
      },
    });
  }
  // Public fixture address only; no environment or connection values are printed.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ mode, pool: poolAddress }));
} finally {
  await prisma.$disconnect();
}
