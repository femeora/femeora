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
    data: { xId: `verify-feed-${label}-${suffix}`, handle: `verify_feed_${label}_${suffix.slice(0, 8)}` },
    select: { id: true },
  });
  userIds.push(user.id);
  const token = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function requestHeaders(cookie?: string) {
  return {
    ...(cookie ? { cookie } : {}),
    origin: environment.WEB_BASE_URL,
    'content-type': 'application/json',
  };
}

try {
  await app.ready();
  const ownerUser = await createUser('owner');
  const socialUser = await createUser('social');
  const ownerWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  await prisma.wallet.create({ data: { address: ownerWallet, userId: ownerUser.id } });

  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID,
      address: hex(20),
      type: 'DLMM',
      tokenX: hex(20),
      tokenY: hex(20),
      quoteToken: hex(20),
      binStep: 25,
      baseFeePips: 3_000,
      createdBlock: 1n,
    },
  });
  poolId = pool.id;
  // Keep generated IDs inside PostgreSQL's signed BIGINT range.
  positionId = BigInt(`0x${randomBytes(7).toString('hex')}`);
  await prisma.position.create({
    data: {
      id: positionId,
      chainId: environment.CHAIN_ID,
      poolId: pool.id,
      owner: ownerWallet,
      lowerBin: -2,
      upperBin: 2,
      shape: 0,
      status: 'open',
      depositedQuote: '1000000',
      earnedQuote: '25000',
      valueQuote: '1100000',
    },
  });
  const positionEvent = await prisma.positionEvent.create({
    data: {
      chainId: environment.CHAIN_ID,
      transactionHash: hex(32),
      logIndex: 0,
      positionId,
      blockNumber: 1n,
      blockHash: hex(32),
      timestamp: new Date(),
      eventType: 'created',
      owner: ownerWallet,
      payload: { verification: true },
    },
  });

  const forbiddenOwner = await app.inject({
    method: 'POST',
    url: '/v1/callouts/from-position',
    headers: requestHeaders(socialUser.cookie),
    payload: { chainId: environment.CHAIN_ID, positionId: positionId.toString(), caption: 'Not mine' },
  });
  const createResponse = await app.inject({
    method: 'POST',
    url: '/v1/callouts/from-position',
    headers: requestHeaders(ownerUser.cookie),
    payload: {
      chainId: environment.CHAIN_ID,
      positionId: positionId.toString(),
      caption: 'Proof-backed liquidity position',
      showSize: true,
    },
  });
  if (createResponse.statusCode !== 201) throw new Error('VERIFY_CALLOUT_CREATE_FAILED');
  calloutId = createResponse.json<{ id: string }>().id;
  const update = await prisma.calloutUpdate.create({
    data: { calloutId, positionEventId: positionEvent.id, type: 'Added' },
  });

  const captionEdit = await app.inject({
    method: 'PATCH',
    url: `/v1/callouts/${calloutId}`,
    headers: requestHeaders(ownerUser.cookie),
    payload: { caption: 'Edited within ten minutes' },
  });
  const updateCaptionEdit = await app.inject({
    method: 'PATCH',
    url: `/v1/callouts/${calloutId}/updates/${update.id}`,
    headers: requestHeaders(ownerUser.cookie),
    payload: { caption: 'Verified lifecycle update' },
  });
  const invalidCaption = await app.inject({
    method: 'PATCH',
    url: `/v1/callouts/${calloutId}`,
    headers: requestHeaders(ownerUser.cookie),
    payload: { caption: 'Visit https://phishing.invalid' },
  });

  await prisma.follow.create({ data: { followerId: socialUser.id, followeeId: ownerUser.id } });
  await prisma.userStat.create({
    data: { userId: ownerUser.id, window: '24h', callouts: 1, score: '1.5' },
  });
  const like = await app.inject({ method: 'POST', url: `/v1/callouts/${calloutId}/like`, headers: requestHeaders(socialUser.cookie), payload: {} });
  const repost = await app.inject({ method: 'POST', url: `/v1/callouts/${calloutId}/repost`, headers: requestHeaders(socialUser.cookie), payload: {} });
  const reply = await app.inject({
    method: 'POST',
    url: `/v1/callouts/${calloutId}/replies`,
    headers: requestHeaders(socialUser.cookie),
    payload: { body: 'Useful onchain position' },
  });

  const [latestFeed, followingFeed, bestFeed, poolCallouts, detail] = await Promise.all([
    app.inject({ method: 'GET', url: '/v1/feed?tab=callouts', headers: { cookie: socialUser.cookie } }),
    app.inject({ method: 'GET', url: '/v1/feed?tab=following', headers: { cookie: socialUser.cookie } }),
    app.inject({ method: 'GET', url: '/v1/feed?tab=best&window=24h', headers: { cookie: socialUser.cookie } }),
    app.inject({ method: 'GET', url: `/v1/pools/${pool.address}/callouts` }),
    app.inject({ method: 'GET', url: `/v1/callouts/${calloutId}` }),
  ]);
  const containsCallout = (response: typeof latestFeed) => response.body.includes(calloutId!);

  await prisma.callout.update({
    where: { id: calloutId },
    data: { createdAt: new Date(Date.now() - 11 * 60 * 1_000) },
  });
  const lateEdit = await app.inject({
    method: 'PATCH',
    url: `/v1/callouts/${calloutId}`,
    headers: requestHeaders(ownerUser.cookie),
    payload: { caption: 'Too late' },
  });
  const statsEvents = await prisma.outboxEvent.count({
    where: { aggregateId: calloutId, topic: 'callout.stats', canonical: true },
  });
  const softDelete = await app.inject({
    method: 'DELETE',
    url: `/v1/callouts/${calloutId}`,
    headers: requestHeaders(ownerUser.cookie),
    payload: {},
  });
  const deletedDetail = await app.inject({ method: 'GET', url: `/v1/callouts/${calloutId}` });

  const result = {
    ownershipEnforced: forbiddenOwner.statusCode === 403,
    existingPositionCalloutCreated: createResponse.statusCode === 201,
    captionEditAccepted: captionEdit.statusCode === 200,
    updateCaptionAccepted: updateCaptionEdit.statusCode === 200,
    phishingCaptionRejected: invalidCaption.statusCode === 400,
    socialWritesAccepted: like.statusCode === 201 && repost.statusCode === 201 && reply.statusCode === 201,
    latestFeedReturned: latestFeed.statusCode === 200 && containsCallout(latestFeed),
    followingFeedReturned: followingFeed.statusCode === 200 && containsCallout(followingFeed),
    bestFeedReturned: bestFeed.statusCode === 200 && containsCallout(bestFeed),
    poolCalloutsReturned: poolCallouts.statusCode === 200 && containsCallout(poolCallouts),
    canonicalDetailReturned: detail.statusCode === 200 && containsCallout(detail),
    editWindowEnforced: lateEdit.statusCode === 409,
    statsOutboxWritten: statsEvents === 3,
    softDeleteHidden: softDelete.statusCode === 204 && deletedDetail.statusCode === 404,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('CALLOUT_FEED_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'CALLOUT_FEED_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (calloutId) {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: calloutId } });
    await prisma.callout.deleteMany({ where: { id: calloutId } });
  }
  if (positionId !== null) {
    await prisma.positionEvent.deleteMany({ where: { chainId: environment.CHAIN_ID, positionId } });
    await prisma.position.deleteMany({ where: { chainId: environment.CHAIN_ID, id: positionId } });
  }
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
}
