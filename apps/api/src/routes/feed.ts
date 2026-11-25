import { prisma, type Prisma } from '@fomeora/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import {
  calloutInclude,
  resolveCalloutViewerStates,
  serializeCallout,
  visibleCalloutWhere,
  type CalloutView,
} from '../core/callouts/view.js';

const feedQuerySchema = z.object({
  tab: z.enum(['callouts', 'following', 'best']).default('callouts'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
  window: z.enum(['24h', '7d', '30d', 'all']).default('24h'),
  pool: z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase()).optional(),
});

function afterCursor<T extends { id: string }>(items: T[], cursor: string | undefined): T[] {
  if (!cursor) return items;
  const index = items.findIndex(item => item.id === cursor);
  return index < 0 ? [] : items.slice(index + 1);
}

export async function registerFeedRoutes(app: FastifyInstance, chainId: number) {
  app.get('/v1/feed/rail', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [poolCounts, topCallers] = await Promise.all([
      prisma.callout.groupBy({
        by: ['poolId'],
        where: { ...visibleCalloutWhere, chainId, createdAt: { gte: since }, pool: { canonical: true } },
        _count: { poolId: true },
        orderBy: { _count: { poolId: 'desc' } },
        take: 3,
      }),
      prisma.userStat.findMany({
        where: { window: '24h', user: { banned: false } },
        include: { user: { select: { handle: true, name: true, avatarUrl: true, xVerified: true } } },
        orderBy: [{ score: 'desc' }, { rank: 'asc' }, { userId: 'asc' }],
        take: 3,
      }),
    ]);
    const pools = poolCounts.length === 0 ? [] : await prisma.pool.findMany({
      where: { id: { in: poolCounts.map(row => row.poolId) }, chainId, canonical: true },
      include: { candles: { where: { interval: '1h', bucketStart: { gte: since } }, orderBy: { bucketStart: 'asc' }, select: { close: true } } },
    });
    const poolById = new Map(pools.map(pool => [pool.id, pool]));
    return {
      trendingPools: poolCounts.flatMap(row => {
        const pool = poolById.get(row.poolId);
        if (!pool) return [];
        const first = pool.candles.at(0)?.close.toNumber();
        const last = pool.candles.at(-1)?.close.toNumber();
        const change24h = first && last !== undefined ? (last / first - 1) * 100 : null;
        return [{
          chainId: pool.chainId,
          address: pool.address,
          tokenX: pool.tokenX,
          tokenY: pool.tokenY,
          quoteToken: pool.quoteToken,
          callouts24h: row._count.poolId,
          change24h,
        }];
      }),
      topCallers: topCallers.map(row => ({
        userId: row.userId,
        handle: row.user.handle,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        xVerified: row.user.xVerified,
        rank: row.rank,
        callouts: row.callouts,
        earnedQuote: row.earnedQuote.toFixed(),
        avgInRange: row.avgInRange.toFixed(),
        tailers: row.tailers,
        quickExits: row.quickExits,
        score: row.score.toFixed(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  });

  app.get('/v1/feed', async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_FEED_QUERY' });
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (parsed.data.tab === 'following' && !session) {
      return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    }

    const poolFilter: Prisma.CalloutWhereInput = parsed.data.pool
      ? { pool: { address: parsed.data.pool, chainId, canonical: true } }
      : {};
    const baseWhere: Prisma.CalloutWhereInput = {
      ...visibleCalloutWhere,
      chainId,
      ...poolFilter,
    };

    if (parsed.data.tab === 'best') {
      const stats = await prisma.userStat.findMany({
        where: { window: parsed.data.window },
        orderBy: [{ score: 'desc' }, { userId: 'asc' }],
        take: 500,
        select: { userId: true, score: true },
      });
      const scores = new Map(stats.map(stat => [stat.userId, stat.score.toString()]));
      const rank = new Map(stats.map((stat, index) => [stat.userId, index]));
      const candidates = await prisma.callout.findMany({
        where: { ...baseWhere, userId: { in: stats.map(stat => stat.userId) } },
        include: calloutInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 500,
      });
      candidates.sort((left, right) => {
        const rankDifference = (rank.get(left.userId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.userId) ?? Number.MAX_SAFE_INTEGER);
        return rankDifference || right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
      });
      const page = afterCursor(candidates, parsed.data.cursor).slice(0, parsed.data.limit);
      const viewer = await resolveCalloutViewerStates(session?.userId, page);
      return {
        data: page.map(callout => serializeCallout(callout, scores.get(callout.userId) ?? '0', viewer.get(callout.id))),
        nextCursor: page.length === parsed.data.limit ? page.at(-1)?.id ?? null : null,
      };
    }

    const where: Prisma.CalloutWhereInput =
      parsed.data.tab === 'following'
        ? { ...baseWhere, user: { followers: { some: { followerId: session!.userId } } } }
        : baseWhere;
    const callouts: CalloutView[] = await prisma.callout.findMany({
      where,
      include: calloutInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
      take: parsed.data.limit,
    });
    const viewer = await resolveCalloutViewerStates(session?.userId, callouts);
    return {
      data: callouts.map(callout => serializeCallout(callout, null, viewer.get(callout.id))),
      nextCursor: callouts.length === parsed.data.limit ? callouts.at(-1)?.id ?? null : null,
    };
  });
}
