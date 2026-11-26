import { prisma, type Prisma } from '@fomeora/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import { calloutInclude, resolveCalloutViewerStates, serializeCallout, visibleCalloutWhere } from '../core/callouts/view.js';

const handleParamsSchema = z.object({
  handle: z.string().trim().min(1).max(50).regex(/^@?[A-Za-z0-9_]+$/).transform(value => value.replace(/^@/, '').toLowerCase()),
});
const idParamsSchema = z.object({ id: z.string().uuid() });
const windowSchema = z.enum(['24h', '7d', '30d', 'all']);
const leaderboardQuerySchema = z.object({
  window: windowSchema.default('24h'),
  sort: z.enum(['score', 'earned', 'tailers', 'inRange']).default('score'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
});
const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
  unread: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
});
const reportBodySchema = z.object({
  type: z.enum(['callout', 'user', 'reply']),
  targetId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(10).max(500),
});

async function authenticated(request: { cookies: Record<string, string | undefined> }) {
  return resolveSession(request.cookies[SESSION_COOKIE_NAME]);
}

function leaderboardOrder(sort: z.infer<typeof leaderboardQuerySchema>['sort']): Prisma.UserStatOrderByWithRelationInput[] {
  const primary: Prisma.UserStatOrderByWithRelationInput =
    sort === 'earned'
      ? { earnedQuote: 'desc' }
      : sort === 'tailers'
        ? { tailers: 'desc' }
        : sort === 'inRange'
          ? { avgInRange: 'desc' }
          : { score: 'desc' };
  return [primary, { rank: 'asc' }, { userId: 'asc' }];
}

async function reportTargetExists(type: z.infer<typeof reportBodySchema>['type'], targetId: string) {
  if (type === 'user') return Boolean(await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } }));
  if (type === 'callout') {
    return Boolean(await prisma.callout.findFirst({ where: { id: targetId, ...visibleCalloutWhere }, select: { id: true } }));
  }
  return Boolean(await prisma.reply.findFirst({ where: { id: targetId, hidden: false }, select: { id: true } }));
}

export async function registerSocialRoutes(app: FastifyInstance, chainId: number) {
  app.get('/v1/users/:handle', async (request, reply) => {
    const params = handleParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_HANDLE' });
    const session = await authenticated(request);
    const user = await prisma.user.findFirst({
      where: { handle: { equals: params.data.handle, mode: 'insensitive' }, banned: false },
      select: {
        id: true,
        handle: true,
        name: true,
        avatarUrl: true,
        xVerified: true,
        xFollowers: true,
        createdAt: true,
        stats: { orderBy: { window: 'asc' } },
        _count: { select: { followers: true, following: true, callouts: true } },
        followers: session ? { where: { followerId: session.userId }, select: { followerId: true } } : false,
      },
    });
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    const callouts = await prisma.callout.findMany({
      where: { ...visibleCalloutWhere, chainId, userId: user.id },
      include: calloutInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    const trackRows = await prisma.callout.findMany({
      where: { ...visibleCalloutWhere, chainId, userId: user.id },
      select: { quickExitMinutes: true, position: { select: { status: true, openSeconds: true, inRangeSeconds: true } } },
    });
    const openCallouts = trackRows.filter(row => row.position.status === 'open').length;
    const closedCallouts = trackRows.filter(row => row.position.status === 'closed').length;
    const averageHoldSeconds = trackRows.length === 0
      ? 0
      : Math.round(trackRows.reduce((sum, row) => sum + Number(row.position.openSeconds), 0) / trackRows.length);
    const inRangeRatios = trackRows
      .map(row => Number(row.position.openSeconds) === 0 ? 0 : Number(row.position.inRangeSeconds) * 100 / Number(row.position.openSeconds))
      .sort((left, right) => left - right);
    const medianInRange = inRangeRatios.length === 0
      ? 0
      : inRangeRatios.length % 2 === 1
        ? inRangeRatios[Math.floor(inRangeRatios.length / 2)]!
        : (inRangeRatios[inRangeRatios.length / 2 - 1]! + inRangeRatios[inRangeRatios.length / 2]!) / 2;
    const viewer = await resolveCalloutViewerStates(session?.userId, callouts);
    return {
      user: {
        id: user.id,
        handle: user.handle,
        name: user.name,
        avatarUrl: user.avatarUrl,
        xVerified: user.xVerified,
        xFollowers: user.xFollowers,
        createdAt: user.createdAt.toISOString(),
        followers: user._count.followers,
        following: user._count.following,
        callouts: user._count.callouts,
        followedByMe: user.followers.length > 0,
      },
      stats: user.stats.map(stat => ({
        window: stat.window,
        callouts: stat.callouts,
        earnedQuote: stat.earnedQuote.toString(),
        avgInRange: stat.avgInRange.toString(),
        tailers: stat.tailers,
        quickExits: stat.quickExits,
        score: stat.score.toString(),
        rank: stat.rank,
        updatedAt: stat.updatedAt.toISOString(),
      })),
      trackRecord: {
        openCallouts,
        closedCallouts,
        averageHoldSeconds,
        medianInRange,
        quickExits: trackRows.filter(row => row.quickExitMinutes !== null).length,
      },
      callouts: callouts.map(callout => serializeCallout(callout, null, viewer.get(callout.id))),
    };
  });

  app.post('/v1/users/:handle/follow', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await authenticated(request);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = handleParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_HANDLE' });
    const followee = await prisma.user.findFirst({
      where: { handle: { equals: params.data.handle, mode: 'insensitive' }, banned: false },
      select: { id: true },
    });
    if (!followee) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    if (followee.id === session.userId) return reply.status(409).send({ error: 'SELF_FOLLOW_NOT_ALLOWED' });
    const created = await prisma.$transaction(async tx => {
      const existing = await tx.follow.findUnique({
        where: { followerId_followeeId: { followerId: session.userId, followeeId: followee.id } },
      });
      if (existing) return false;
      await tx.follow.create({ data: { followerId: session.userId, followeeId: followee.id } });
      const notification = await tx.notification.create({
        data: {
          userId: followee.id,
          actorUserId: session.userId,
          type: 'follow',
          entityType: 'user',
          entityId: session.userId,
          payload: { followerId: session.userId },
        },
      });
      await tx.outboxEvent.create({
        data: {
          dedupKey: `notification:${notification.id}`,
          topic: 'notification.new',
          aggregateId: followee.id,
          payload: { notificationId: notification.id, userId: followee.id, type: 'follow' },
        },
      });
      return true;
    });
    return reply.status(created ? 201 : 200).send({ following: true });
  });

  app.delete('/v1/users/:handle/follow', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await authenticated(request);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = handleParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_HANDLE' });
    const followee = await prisma.user.findFirst({
      where: { handle: { equals: params.data.handle, mode: 'insensitive' }, banned: false },
      select: { id: true },
    });
    if (!followee) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    await prisma.follow.deleteMany({ where: { followerId: session.userId, followeeId: followee.id } });
    return { following: false };
  });

  app.get('/v1/leaderboard', async (request, reply) => {
    const query = leaderboardQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'INVALID_LEADERBOARD_QUERY' });
    const rows = await prisma.userStat.findMany({
      where: { window: query.data.window, user: { banned: false } },
      include: { user: { select: { handle: true, name: true, avatarUrl: true, xVerified: true } } },
      orderBy: leaderboardOrder(query.data.sort),
      take: 500,
    });
    const start = query.data.cursor ? rows.findIndex(row => row.userId === query.data.cursor) + 1 : 0;
    if (query.data.cursor && start === 0) return reply.status(400).send({ error: 'INVALID_LEADERBOARD_CURSOR' });
    const page = rows.slice(start, start + query.data.limit);
    return {
      data: page.map(row => ({
        userId: row.userId,
        handle: row.user.handle,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        xVerified: row.user.xVerified,
        rank: row.rank,
        callouts: row.callouts,
        earnedQuote: row.earnedQuote.toString(),
        avgInRange: row.avgInRange.toString(),
        tailers: row.tailers,
        quickExits: row.quickExits,
        score: row.score.toString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor: page.length === query.data.limit ? page.at(-1)?.userId ?? null : null,
    };
  });

  app.get('/v1/notifications', async (request, reply) => {
    const session = await authenticated(request);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const query = notificationQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'INVALID_NOTIFICATION_QUERY' });
    const notifications = await prisma.notification.findMany({
      where: { userId: session.userId, ...(query.data.unread === true ? { readAt: null } : {}) },
      include: { actor: { select: { handle: true, name: true, avatarUrl: true, xVerified: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      take: query.data.limit,
    });
    return {
      data: notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        entityType: notification.entityType,
        entityId: notification.entityId,
        payload: notification.payload,
        actor: notification.actor,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      })),
      nextCursor: notifications.length === query.data.limit ? notifications.at(-1)?.id ?? null : null,
    };
  });

  app.post('/v1/notifications/:id/read', { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await authenticated(request);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_NOTIFICATION_ID' });
    const updated = await prisma.notification.updateMany({
      where: { id: params.data.id, userId: session.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await prisma.notification.findFirst({ where: { id: params.data.id, userId: session.userId } });
      if (!exists) return reply.status(404).send({ error: 'NOTIFICATION_NOT_FOUND' });
    }
    return { read: true };
  });

  app.post('/v1/reports', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await authenticated(request);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const body = reportBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'INVALID_REPORT' });
    if (!(await reportTargetExists(body.data.type, body.data.targetId))) {
      return reply.status(404).send({ error: 'REPORT_TARGET_NOT_FOUND' });
    }
    const duplicate = await prisma.report.findFirst({
      where: {
        reporterId: session.userId,
        type: body.data.type,
        targetId: body.data.targetId,
        status: 'open',
      },
      select: { id: true },
    });
    if (duplicate) return reply.status(409).send({ error: 'REPORT_ALREADY_OPEN' });
    const report = await prisma.report.create({
      data: { reporterId: session.userId, ...body.data },
      select: { id: true, createdAt: true },
    });
    return reply.status(201).send({ id: report.id, status: 'open', createdAt: report.createdAt.toISOString() });
  });
}
