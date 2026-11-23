import { randomBytes, randomUUID } from 'node:crypto';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

process.env.NODE_ENV = 'test';

const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createSession, SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { createServer } = await import('../src/index.js');

const app = await createServer(environment);
const userIds: string[] = [];
let poolId: string | null = null;
let positionId: bigint | null = null;
let calloutId: string | null = null;
const hex = (bytes: number) => `0x${randomBytes(bytes).toString('hex')}`;

async function createUser(label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const user = await prisma.user.create({
    data: { xId: `verify-tail-${label}-${suffix}`, handle: `verify_tail_${label}_${suffix.slice(0, 8)}` },
    select: { id: true },
  });
  userIds.push(user.id);
  const token = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function headers(cookie?: string) {
  return {
    ...(cookie ? { cookie } : {}),
    origin: environment.WEB_BASE_URL,
    'content-type': 'application/json',
  };
}

try {
  await app.ready();
  const sourceUser = await createUser('source');
  const tailerUser = await createUser('tailer');
  const sourceWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const tailerWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  await prisma.wallet.createMany({
    data: [
      { address: sourceWallet, userId: sourceUser.id },
      { address: tailerWallet, userId: tailerUser.id },
    ],
  });
  const tokenX = hex(20);
  const tokenY = hex(20);
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID,
      address: hex(20),
      type: 'DLMM',
      tokenX,
      tokenY,
      quoteToken: tokenY,
      binStep: 25,
      baseFeePips: 3_000,
      activeBin: 0,
      createdBlock: 1n,
    },
  });
  poolId = pool.id;
  // Keep generated IDs inside PostgreSQL's signed BIGINT range.
  positionId = BigInt(`0x${randomBytes(7).toString('hex')}`);
  await prisma.position.create({
    data: {
      chainId: environment.CHAIN_ID,
      id: positionId,
      poolId: pool.id,
      owner: sourceWallet,
      lowerBin: 10,
      upperBin: 20,
      shape: 1,
      status: 'open',
    },
  });
  const callout = await prisma.callout.create({
    data: {
      userId: sourceUser.id,
      chainId: environment.CHAIN_ID,
      positionId,
      poolId: pool.id,
      side: 'below',
      shape: 1,
      lowerBin: 10,
      upperBin: 20,
      status: 'live',
    },
  });
  calloutId = callout.id;

  const sameRange = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${callout.id}/tail-quote`,
    headers: headers(),
    payload: { mode: 'same_range' },
  });
  const sameShape = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${callout.id}/tail-quote`,
    headers: headers(),
    payload: { mode: 'same_shape_now' },
  });
  const rangeQuote = sameRange.json<{
    lowerBin: number;
    upperBin: number;
    requiresTokenX: boolean;
    requiresTokenY: boolean;
    warnings: string[];
  }>();
  const shapeQuote = sameShape.json<{ lowerBin: number; upperBin: number; expectedActiveBin: number }>();

  const intentResponse = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${callout.id}/tail-intent`,
    headers: headers(tailerUser.cookie),
    payload: { mode: 'same_shape_now', walletAddress: tailerWallet },
  });
  const intentBody = intentResponse.json<{ intentId: string; tag: string; referrer: string }>();
  const storedIntent = intentBody.intentId
    ? await prisma.calloutIntent.findUnique({ where: { id: intentBody.intentId } })
    : null;

  const selfTail = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${callout.id}/tail-intent`,
    headers: headers(sourceUser.cookie),
    payload: { mode: 'same_range', walletAddress: sourceWallet },
  });
  const unlinkedWallet = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${callout.id}/tail-intent`,
    headers: headers(tailerUser.cookie),
    payload: { mode: 'same_range', walletAddress: privateKeyToAccount(generatePrivateKey()).address },
  });

  await prisma.pool.update({ where: { id: pool.id }, data: { activeBin: null } });
  const unavailable = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${callout.id}/tail-intent`,
    headers: headers(tailerUser.cookie),
    payload: { mode: 'same_range', walletAddress: tailerWallet },
  });

  const result = {
    sameRangeQuoted: sameRange.statusCode === 200 && rangeQuote.lowerBin === 10 && rangeQuote.upperBin === 20,
    tokenSideDerived: rangeQuote.requiresTokenX && !rangeQuote.requiresTokenY,
    sideChangeWarned: rangeQuote.warnings.includes('SOURCE_SIDE_CHANGED') && rangeQuote.warnings.includes('SOURCE_RANGE_OUT_OF_RANGE'),
    sameShapeRecentered: sameShape.statusCode === 200 && shapeQuote.lowerBin === -5 && shapeQuote.upperBin === 5 && shapeQuote.expectedActiveBin === 0,
    intentCreated: intentResponse.statusCode === 201 && /^0x[0-9a-f]{64}$/.test(intentBody.tag),
    sourceCalloutBound: storedIntent?.sourceCalloutId === callout.id && storedIntent.kind === 'tail',
    referrerBound: intentBody.referrer === sourceWallet && storedIntent?.referrer === sourceWallet,
    selfTailDenied: selfTail.statusCode === 409,
    unlinkedWalletDenied: unlinkedWallet.statusCode === 403,
    missingActiveBinDenied: unavailable.statusCode === 409,
    noAutoExecution: (await prisma.tail.count({ where: { calloutId: callout.id } })) === 0,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('TAIL_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'TAIL_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (calloutId) await prisma.callout.deleteMany({ where: { id: calloutId } });
  if (poolId) await prisma.position.deleteMany({ where: { poolId } });
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
}
