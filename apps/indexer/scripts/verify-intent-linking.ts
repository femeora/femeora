import { randomBytes, randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { resolveCalloutIntent, resolveTailIntent } =
  await import('../src/processors/intent-linking.js');

const environment = loadIndexerEnvironment();
const hex = (bytes: number) => `0x${randomBytes(bytes).toString('hex')}`;
const now = new Date();
const sourceUserId = randomUUID();
const tailerUserId = randomUUID();
const sourceWallet = hex(20);
const tailerWallet = hex(20);
const positionId = BigInt(`0x${randomBytes(7).toString('hex')}`);
const tags = Array.from({ length: 6 }, () => hex(32));
const referrer = hex(20);
let poolId: string | null = null;

try {
  await prisma.user.createMany({
    data: [
      {
        id: sourceUserId,
        xId: `intent-source-${randomUUID()}`,
        handle: `intent_source_${randomBytes(4).toString('hex')}`,
      },
      {
        id: tailerUserId,
        xId: `intent-tailer-${randomUUID()}`,
        handle: `intent_tailer_${randomBytes(4).toString('hex')}`,
      },
    ],
  });
  await prisma.wallet.createMany({
    data: [
      { address: sourceWallet, userId: sourceUserId },
      { address: tailerWallet, userId: tailerUserId },
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
      createdBlock: 1n,
    },
  });
  poolId = pool.id;
  await prisma.position.create({
    data: {
      id: positionId,
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      owner: sourceWallet,
      lowerBin: -1,
      upperBin: 1,
      shape: 0,
      status: 'open',
    },
  });
  const sourceCallout = await prisma.callout.create({
    data: {
      userId: sourceUserId,
      chainId: environment.CHAIN_ID,
      positionId,
      poolId: pool.id,
      shape: 0,
      lowerBin: -1,
      upperBin: 1,
      status: 'live',
    },
  });
  const minute = 60_000;
  await prisma.calloutIntent.createMany({
    data: [
      {
        userId: tailerUserId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[0]!,
        kind: 'callout',
        createdAt: new Date(now.getTime() - minute),
        expiresAt: new Date(now.getTime() + minute),
      },
      {
        userId: tailerUserId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[1]!,
        kind: 'callout',
        createdAt: new Date(now.getTime() + minute),
        expiresAt: new Date(now.getTime() + 2 * minute),
      },
      {
        userId: tailerUserId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[2]!,
        kind: 'callout',
        createdAt: new Date(now.getTime() - 2 * minute),
        expiresAt: new Date(now.getTime() - minute),
      },
      {
        userId: tailerUserId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[3]!,
        kind: 'tail',
        referrer,
        sourceCalloutId: sourceCallout.id,
        createdAt: new Date(now.getTime() - minute),
        expiresAt: new Date(now.getTime() + minute),
      },
      {
        userId: sourceUserId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[4]!,
        kind: 'tail',
        referrer,
        sourceCalloutId: sourceCallout.id,
        createdAt: new Date(now.getTime() - minute),
        expiresAt: new Date(now.getTime() + minute),
      },
      {
        userId: tailerUserId,
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[5]!,
        kind: 'callout',
        createdAt: new Date(now.getTime() - minute),
        expiresAt: new Date(now.getTime() + minute),
        consumedAt: now,
      },
    ],
  });

  const result = await prisma.$transaction(async transaction => ({
    validCallout: Boolean(
      await resolveCalloutIntent(transaction, {
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[0]!,
        owner: tailerWallet,
        eventTimestamp: now,
      })
    ),
    foreignWalletRejected: !(await resolveCalloutIntent(transaction, {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag: tags[0]!,
      owner: sourceWallet,
      eventTimestamp: now,
    })),
    futureIntentRejected: !(await resolveCalloutIntent(transaction, {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag: tags[1]!,
      owner: tailerWallet,
      eventTimestamp: now,
    })),
    expiredIntentRejected: !(await resolveCalloutIntent(transaction, {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag: tags[2]!,
      owner: tailerWallet,
      eventTimestamp: now,
    })),
    consumedIntentRejected: !(await resolveCalloutIntent(transaction, {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag: tags[5]!,
      owner: tailerWallet,
      eventTimestamp: now,
    })),
    wrongChainRejected: !(await resolveCalloutIntent(transaction, {
      chainId: environment.CHAIN_ID + 1,
      poolId: pool.id,
      tag: tags[0]!,
      owner: tailerWallet,
      eventTimestamp: now,
    })),
    validTail: Boolean(
      await resolveTailIntent(transaction, {
        chainId: environment.CHAIN_ID,
        poolId: pool.id,
        tag: tags[3]!,
        owner: tailerWallet,
        eventTimestamp: now,
        referrer,
      })
    ),
    wrongReferrerRejected: !(await resolveTailIntent(transaction, {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag: tags[3]!,
      owner: tailerWallet,
      eventTimestamp: now,
      referrer: hex(20),
    })),
    selfTailRejected: !(await resolveTailIntent(transaction, {
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag: tags[4]!,
      owner: sourceWallet,
      eventTimestamp: now,
      referrer,
    })),
  }));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value))
    throw new Error('INTENT_LINKING_ACCEPTANCE_FAILED');
} catch {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ error: 'INTENT_LINKING_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await prisma.calloutIntent.deleteMany({ where: { tag: { in: tags } } });
  await prisma.callout.deleteMany({ where: { chainId: environment.CHAIN_ID, positionId } });
  await prisma.position.deleteMany({ where: { chainId: environment.CHAIN_ID, id: positionId } });
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  await prisma.wallet.deleteMany({ where: { address: { in: [sourceWallet, tailerWallet] } } });
  await prisma.user.deleteMany({ where: { id: { in: [sourceUserId, tailerUserId] } } });
  await prisma.$disconnect();
}
