import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';

const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createSession, SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { createServer } = await import('../src/index.js');

const app = await createServer(environment);
const userIds: string[] = [];

async function createUser(label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const user = await prisma.user.create({
    data: {
      xId: `verify-social-${label}-${suffix}`,
      handle: `verify_social_${label}_${suffix.slice(0, 8)}`,
      name: `Verify ${label}`,
    },
  });
  userIds.push(user.id);
  const token = await createSession(user.id);
  return { ...user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
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
  const leader = await createUser('leader');
  const follower = await createUser('follower');
  const outsider = await createUser('outsider');
  await prisma.userStat.createMany({
    data: [
      { userId: leader.id, window: '24h', rank: 1, callouts: 4, earnedQuote: '25', avgInRange: '92.50', tailers: 8, score: '0.75' },
      { userId: follower.id, window: '24h', rank: 2, callouts: 2, earnedQuote: '10', avgInRange: '70', tailers: 3, score: '0.25' },
    ],
  });

  const follow = await app.inject({ method: 'POST', url: `/v1/users/${leader.handle}/follow`, headers: headers(follower.cookie), payload: {} });
  const followAgain = await app.inject({ method: 'POST', url: `/v1/users/${leader.handle}/follow`, headers: headers(follower.cookie), payload: {} });
  const selfFollow = await app.inject({ method: 'POST', url: `/v1/users/${leader.handle}/follow`, headers: headers(leader.cookie), payload: {} });
  const profile = await app.inject({ method: 'GET', url: `/v1/users/@${leader.handle.toUpperCase()}`, headers: headers(follower.cookie) });
  const leaderboard = await app.inject({ method: 'GET', url: '/v1/leaderboard?window=24h&sort=score' });
  const notifications = await app.inject({ method: 'GET', url: '/v1/notifications?unread=true', headers: headers(leader.cookie) });
  const notificationBody = notifications.json<{ data: { id: string; type: string }[] }>();
  const notificationId = notificationBody.data[0]?.id;
  const markRead = notificationId
    ? await app.inject({ method: 'POST', url: `/v1/notifications/${notificationId}/read`, headers: headers(leader.cookie), payload: {} })
    : null;
  const crossAccountRead = notificationId
    ? await app.inject({ method: 'POST', url: `/v1/notifications/${notificationId}/read`, headers: headers(outsider.cookie), payload: {} })
    : null;
  const report = await app.inject({
    method: 'POST',
    url: '/v1/reports',
    headers: headers(follower.cookie),
    payload: { type: 'user', targetId: leader.id, reason: 'Controlled verification report only' },
  });
  const duplicateReport = await app.inject({
    method: 'POST',
    url: '/v1/reports',
    headers: headers(follower.cookie),
    payload: { type: 'user', targetId: leader.id, reason: 'Controlled verification report only' },
  });
  const unauthenticated = await app.inject({ method: 'GET', url: '/v1/notifications' });
  const unfollow = await app.inject({ method: 'DELETE', url: `/v1/users/${leader.handle}/follow`, headers: headers(follower.cookie), payload: {} });

  const profileBody = profile.json<{ user: { followedByMe: boolean; followers: number }; stats: unknown[] }>();
  const leaderboardBody = leaderboard.json<{ data: { userId: string; score: string }[] }>();
  const result = {
    followCreated: follow.statusCode === 201,
    followIdempotent: followAgain.statusCode === 200,
    selfFollowDenied: selfFollow.statusCode === 409,
    caseInsensitiveProfile: profile.statusCode === 200 && profileBody.user.followedByMe && profileBody.user.followers === 1,
    profileStatsReturned: profileBody.stats.length === 1,
    leaderboardOrdered: leaderboard.statusCode === 200 && leaderboardBody.data[0]?.userId === leader.id && leaderboardBody.data[0]?.score === '0.75',
    notificationCreated: notifications.statusCode === 200 && notificationBody.data.length === 1 && notificationBody.data[0]?.type === 'follow',
    notificationRead: markRead?.statusCode === 200,
    notificationOwnershipEnforced: crossAccountRead?.statusCode === 404,
    reportCreated: report.statusCode === 201,
    duplicateReportDenied: duplicateReport.statusCode === 409,
    authenticationRequired: unauthenticated.statusCode === 401,
    unfollowed: unfollow.statusCode === 200 && (await prisma.follow.count({ where: { followerId: follower.id, followeeId: leader.id } })) === 0,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('SOCIAL_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'SOCIAL_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (userIds.length > 0) {
    await prisma.outboxEvent.deleteMany({ where: { topic: 'notification.new', aggregateId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const [usersRemaining, outboxRemaining] = await Promise.all([
      prisma.user.count({ where: { id: { in: userIds } } }),
      prisma.outboxEvent.count({ where: { topic: 'notification.new', aggregateId: { in: userIds } } }),
    ]);
    console.log(JSON.stringify({ cleanupComplete: usersRemaining === 0 && outboxRemaining === 0 }));
  }
  await app.close();
  await prisma.$disconnect();
}
