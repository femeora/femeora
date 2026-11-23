import { randomBytes, randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { persistCalloutUpdate } = await import('../src/processors/callout-update-writer.js');

const environment = loadIndexerEnvironment();
const hex = (bytes: number) => `0x${randomBytes(bytes).toString('hex')}`;
const positionId = BigInt(`0x${randomBytes(7).toString('hex')}`);
const userId = randomUUID();
let poolId: string | null = null;
let calloutId: string | null = null;

try {
  await prisma.user.create({
    data: { id: userId, xId: `verify-updates-${randomUUID()}`, handle: `verify_updates_${randomBytes(4).toString('hex')}` },
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

  const types = ['Added', 'Removed', 'Rebalanced', 'Closed'] as const;
  for (const [index, type] of types.entries()) {
    const transactionHash = hex(32);
    const event = await prisma.positionEvent.create({
      data: {
        chainId: environment.CHAIN_ID,
        transactionHash,
        logIndex: index,
        positionId,
        blockNumber: BigInt(index + 1),
        blockHash: hex(32),
        timestamp: new Date(),
        eventType: type.toLowerCase(),
        payload: { verification: true },
      },
    });
    await prisma.$transaction(transaction => persistCalloutUpdate(transaction, {
      chainId: environment.CHAIN_ID,
      positionId,
      positionEventId: event.id,
      transactionHash,
      logIndex: index,
      blockNumber: BigInt(index + 1),
      type,
    }));
  }
  const firstUpdate = await prisma.calloutUpdate.findFirstOrThrow({
    where: { calloutId: callout.id, type: 'Added' },
    include: { positionEvent: true },
  });
  await prisma.$transaction(transaction => persistCalloutUpdate(transaction, {
    chainId: environment.CHAIN_ID,
    positionId,
    positionEventId: firstUpdate.positionEventId,
    transactionHash: firstUpdate.positionEvent.transactionHash,
    logIndex: firstUpdate.positionEvent.logIndex,
    blockNumber: firstUpdate.positionEvent.blockNumber,
    type: 'Added',
  }));

  const [updates, outbox] = await Promise.all([
    prisma.calloutUpdate.findMany({ where: { calloutId: callout.id }, orderBy: { type: 'asc' } }),
    prisma.outboxEvent.findMany({ where: { aggregateId: callout.id, topic: 'callout.update' } }),
  ]);
  const payloadKinds = outbox.map(row => (row.payload as { kind?: string }).kind).sort();
  const expected = [...types].sort();
  const result = {
    allSemanticTypesPersisted: JSON.stringify(updates.map(row => row.type).sort()) === JSON.stringify(expected),
    oneOutboxPerUpdate: outbox.length === 4,
    semanticTypesInOutbox: JSON.stringify(payloadKinds) === JSON.stringify(expected),
    idempotentReplay: updates.length === 4,
    allCanonical: outbox.every(row => row.canonical),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('CALLOUT_UPDATE_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'CALLOUT_UPDATE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (calloutId) {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: calloutId } });
    await prisma.callout.deleteMany({ where: { id: calloutId } });
  }
  await prisma.positionEvent.deleteMany({ where: { chainId: environment.CHAIN_ID, positionId } });
  await prisma.position.deleteMany({ where: { chainId: environment.CHAIN_ID, id: positionId } });
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
