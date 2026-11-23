import { randomBytes, randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { rollbackOrphanSocialDerivations } = await import('../src/reorg.js');

const environment = loadIndexerEnvironment();
const hex = (bytes: number) => `0x${randomBytes(bytes).toString('hex')}`;
const userId = randomUUID();
const positionId = BigInt(`0x${randomBytes(7).toString('hex')}`);
const tag = hex(32);
let poolId: string | null = null;
let calloutId: string | null = null;

try {
  await prisma.user.create({
    data: {
      id: userId,
      xId: `verify-reorg-${randomUUID()}`,
      handle: `verify_reorg_${randomBytes(4).toString('hex')}`,
    },
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
      owner: hex(20),
      lowerBin: -1,
      upperBin: 1,
      shape: 0,
      tag,
      status: 'open',
    },
  });
  const callout = await prisma.callout.create({
    data: {
      userId,
      chainId: environment.CHAIN_ID,
      positionId,
      poolId: pool.id,
      shape: 0,
      lowerBin: -1,
      upperBin: 1,
      status: 'live',
    },
  });
  calloutId = callout.id;
  await prisma.calloutIntent.create({
    data: {
      userId,
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      tag,
      kind: 'tail',
      sourceCalloutId: callout.id,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      consumedAt: new Date(),
    },
  });
  await prisma.tail.create({
    data: {
      calloutId: callout.id,
      chainId: environment.CHAIN_ID,
      positionId,
      tailerUserId: userId,
      tailerWallet: hex(20),
      mode: 'same_range',
    },
  });

  await prisma.$transaction(transaction =>
    rollbackOrphanSocialDerivations(transaction, environment.CHAIN_ID, [positionId], [tag]),
  );
  const [position, restoredCallout, intent, tails] = await Promise.all([
    prisma.position.findUniqueOrThrow({
      where: { chainId_id: { chainId: environment.CHAIN_ID, id: positionId } },
    }),
    prisma.callout.findUniqueOrThrow({ where: { id: callout.id } }),
    prisma.calloutIntent.findUniqueOrThrow({ where: { tag } }),
    prisma.tail.count({ where: { chainId: environment.CHAIN_ID, positionId } }),
  ]);
  const result = {
    orphanPositionHidden: !position.canonical,
    orphanCalloutHidden: !restoredCallout.canonical,
    tailRemoved: tails === 0,
    intentReusableForCanonicalReplay: intent.consumedAt === null,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('REORG_SOCIAL_ACCEPTANCE_FAILED');
} catch {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ error: 'REORG_SOCIAL_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await prisma.tail.deleteMany({ where: { chainId: environment.CHAIN_ID, positionId } });
  await prisma.calloutIntent.deleteMany({ where: { tag } });
  if (calloutId) await prisma.callout.deleteMany({ where: { id: calloutId } });
  await prisma.position.deleteMany({ where: { chainId: environment.CHAIN_ID, id: positionId } });
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
