import { createHash, randomUUID } from 'node:crypto';

import { prisma, type Prisma } from '@fomeora/database';
import { classifyRangeSide } from '@fomeora/sdk';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import { calloutInclude, resolveCalloutViewerStates, serializeCallout, visibleCalloutWhere } from '../core/callouts/view.js';
import { validateCalloutCaption } from '../core/security/anti-phishing.js';
import { createBytes32Tag } from '../core/security/tokens.js';

const INTENT_TTL_SECONDS = 10 * 60;
const CAPTION_EDIT_SECONDS = 10 * 60;
const CALLOUTS_PER_HOUR = 10;
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase());
const calloutParamsSchema = z.object({ id: z.string().uuid() });
const updateParamsSchema = z.object({ id: z.string().uuid(), updateId: z.string().uuid() });
const replyParamsSchema = z.object({ id: z.string().uuid(), replyId: z.string().uuid() });
const positionIdSchema = z.string().regex(/^[0-9]+$/).transform(value => BigInt(value));
const captionSchema = z.string().max(280).transform(value => value.trim());
const intentSchema = z.object({
  chainId: z.number().int().positive(),
  pool: addressSchema,
  caption: captionSchema.optional(),
  showSize: z.boolean().default(true),
});
const existingPositionSchema = z.object({
  chainId: z.number().int().positive(),
  positionId: positionIdSchema,
  caption: captionSchema.optional(),
  showSize: z.boolean().default(true),
});
const captionBodySchema = z.object({ caption: captionSchema.nullable() });
const replyBodySchema = z.object({
  body: captionSchema,
  parentId: z.string().uuid().nullable().optional(),
});

function validatedCaption(caption: string | null | undefined): string | null {
  const normalized = caption?.trim() || null;
  if (normalized && !validateCalloutCaption(normalized).isValid) throw new Error('INVALID_CAPTION');
  return normalized;
}

async function requireSession(request: { cookies: Record<string, string | undefined> }, reply: FastifyReply) {
  const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
  if (!session) await reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
  return session;
}

async function belowHourlyCalloutLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1_000);
  const [callouts, pendingIntents] = await Promise.all([
    prisma.callout.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.calloutIntent.count({
      where: { userId, createdAt: { gte: since }, consumedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return callouts + pendingIntents < CALLOUTS_PER_HOUR;
}

async function createStatsEvent(
  transaction: Prisma.TransactionClient,
  calloutId: string,
  chainId: number,
  action: string,
): Promise<void> {
  const [callout, likes, reposts, replies, quotes, tails, views] = await Promise.all([
    transaction.callout.findUnique({ where: { id: calloutId }, select: { pool: { select: { address: true } } } }),
    transaction.like.count({ where: { calloutId } }),
    transaction.repost.count({ where: { calloutId } }),
    transaction.reply.count({ where: { calloutId, hidden: false, kind: 'reply' } }),
    transaction.reply.count({ where: { calloutId, hidden: false, kind: 'quote' } }),
    transaction.tail.count({ where: { calloutId } }),
    transaction.viewDaily.count({ where: { calloutId } }),
  ]);
  await transaction.outboxEvent.create({
    data: {
      dedupKey: `social:${action}:${calloutId}:${randomUUID()}`,
      topic: 'callout.stats',
      aggregateId: callout?.pool.address.toLowerCase() ?? calloutId,
      chainId,
      payload: { id: calloutId, likes, reposts, replies, quotes, tails, views },
    },
  });
}

async function findVisibleCallout(id: string, chainId: number) {
  return prisma.callout.findFirst({
    where: { id, chainId, ...visibleCalloutWhere },
    select: { id: true, userId: true, chainId: true, createdAt: true },
  });
}

export async function registerCalloutRoutes(app: FastifyInstance, chainId: number) {
  app.post(
    '/v1/callouts/intent',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      const parsed = intentSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.chainId !== chainId) {
        return reply.status(400).send({ error: 'INVALID_INTENT' });
      }
      let caption: string | null;
      try {
        caption = validatedCaption(parsed.data.caption);
      } catch {
        return reply.status(400).send({ error: 'INVALID_CAPTION' });
      }
      if (!(await belowHourlyCalloutLimit(session.userId))) {
        return reply.status(429).send({ error: 'CALLOUT_RATE_LIMIT' });
      }
      const pool = await prisma.pool.findFirst({
        where: { chainId, address: parsed.data.pool, canonical: true },
        select: { id: true },
      });
      if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });

      const tag = createBytes32Tag();
      const expiresAt = new Date(Date.now() + INTENT_TTL_SECONDS * 1_000);
      const intent = await prisma.calloutIntent.create({
        data: {
          userId: session.userId,
          chainId,
          poolId: pool.id,
          caption,
          showSize: parsed.data.showSize,
          tag,
          expiresAt,
        },
      });
      return reply.status(201).send({ intentId: intent.id, tag, expiresAt: expiresAt.toISOString() });
    },
  );

  app.post(
    '/v1/callouts/from-position',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      const parsed = existingPositionSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.chainId !== chainId) {
        return reply.status(400).send({ error: 'INVALID_POSITION_CALLOUT' });
      }
      let caption: string | null;
      try {
        caption = validatedCaption(parsed.data.caption);
      } catch {
        return reply.status(400).send({ error: 'INVALID_CAPTION' });
      }
      if (!(await belowHourlyCalloutLimit(session.userId))) {
        return reply.status(429).send({ error: 'CALLOUT_RATE_LIMIT' });
      }
      const position = await prisma.position.findFirst({
        where: { chainId, id: parsed.data.positionId, canonical: true },
        include: {
          pool: {
            select: {
              id: true,
              address: true,
              canonical: true,
              activeBin: true,
              type: true,
              tokenX: true,
              tokenY: true,
            },
          },
          events: {
            where: { canonical: true },
            orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
            take: 1,
            select: { blockNumber: true, transactionHash: true },
          },
        },
      });
      if (!position) return reply.status(404).send({ error: 'POSITION_NOT_FOUND' });
      if (!position.pool.canonical) {
        const replacement = await prisma.pool.findFirst({
          where: {
            chainId,
            canonical: true,
            type: position.pool.type,
            OR: [
              { tokenX: position.pool.tokenX, tokenY: position.pool.tokenY },
              { tokenX: position.pool.tokenY, tokenY: position.pool.tokenX },
            ],
          },
          orderBy: { createdBlock: 'desc' },
          select: { address: true },
        });
        return reply.status(409).send({
          error: 'POSITION_POOL_NOT_CANONICAL',
          replacementPoolAddress: replacement?.address ?? null,
        });
      }
      if (!session.user.wallets.some(wallet => wallet.address === position.owner.toLowerCase())) {
        return reply.status(403).send({ error: 'POSITION_OWNERSHIP_REQUIRED' });
      }
      const existing = await prisma.callout.findUnique({
        where: { chainId_positionId: { chainId, positionId: position.id } },
        select: { id: true },
      });
      if (existing) return reply.status(409).send({ error: 'POSITION_CALLOUT_EXISTS', id: existing.id });

      const callout = await prisma.$transaction(async transaction => {
        const created = await transaction.callout.create({
          data: {
            userId: session.userId,
            chainId,
            positionId: position.id,
            poolId: position.poolId,
            caption,
            showSize: parsed.data.showSize,
            sizeAtPost: position.valueQuote,
            side: position.pool.activeBin === null
              ? null
              : classifyRangeSide(position.lowerBin, position.upperBin, position.pool.activeBin),
            shape: position.shape,
            lowerBin: position.lowerBin,
            upperBin: position.upperBin,
            status: 'live',
          },
        });
        const latestEvent = position.events[0];
        await transaction.outboxEvent.create({
          data: {
            dedupKey: `callout-existing:${chainId}:${position.id.toString()}`,
            topic: 'callout.new',
            aggregateId: position.pool.address.toLowerCase(),
            chainId,
            blockNumber: latestEvent?.blockNumber ?? null,
            payload: {
              id: created.id,
              chainId,
              positionId: position.id.toString(),
              pool: position.pool.address,
              transactionHash: latestEvent?.transactionHash ?? null,
            },
          },
        });
        return created;
      });
      return reply.status(201).send({ id: callout.id, status: callout.status });
    },
  );

  app.get('/v1/callouts/:id', async (request, reply) => {
    const parsed = calloutParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_CALLOUT_ID' });
    const callout = await prisma.callout.findFirst({
      where: { id: parsed.data.id, chainId, ...visibleCalloutWhere },
      include: calloutInclude,
    });
    if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    const viewer = await resolveCalloutViewerStates(session?.userId, [callout]);
    return serializeCallout(callout, null, viewer.get(callout.id));
  });

  app.get('/v1/pools/:pool/callouts', async (request, reply) => {
    const params = z.object({ pool: addressSchema }).safeParse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const callouts = await prisma.callout.findMany({
      where: {
        chainId,
        ...visibleCalloutWhere,
        pool: { address: params.data.pool, chainId, canonical: true },
      },
      include: calloutInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.data.limit,
    });
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    const viewer = await resolveCalloutViewerStates(session?.userId, callouts);
    return { data: callouts.map(callout => serializeCallout(callout, null, viewer.get(callout.id))) };
  });

  app.patch('/v1/callouts/:id', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const params = calloutParamsSchema.safeParse(request.params);
    const body = captionBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_CALLOUT_EDIT' });
    let caption: string | null;
    try {
      caption = validatedCaption(body.data.caption);
    } catch {
      return reply.status(400).send({ error: 'INVALID_CAPTION' });
    }
    const callout = await prisma.callout.findFirst({
      where: { id: params.data.id, chainId, canonical: true, deletedAt: null },
      select: { userId: true, createdAt: true },
    });
    if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
    if (callout.userId !== session.userId) return reply.status(403).send({ error: 'CALLOUT_OWNERSHIP_REQUIRED' });
    if (Date.now() - callout.createdAt.getTime() > CAPTION_EDIT_SECONDS * 1_000) {
      return reply.status(409).send({ error: 'CAPTION_EDIT_WINDOW_CLOSED' });
    }
    const updated = await prisma.callout.update({
      where: { id: params.data.id },
      data: { caption, captionEditedAt: new Date() },
      select: { id: true, caption: true, captionEditedAt: true },
    });
    return { ...updated, captionEditedAt: updated.captionEditedAt?.toISOString() ?? null };
  });

  app.patch('/v1/callouts/:id/updates/:updateId', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const params = updateParamsSchema.safeParse(request.params);
    const body = captionBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_UPDATE_EDIT' });
    let caption: string | null;
    try {
      caption = validatedCaption(body.data.caption);
    } catch {
      return reply.status(400).send({ error: 'INVALID_CAPTION' });
    }
    const update = await prisma.calloutUpdate.findFirst({
      where: { id: params.data.updateId, calloutId: params.data.id, callout: { userId: session.userId, canonical: true } },
      select: { id: true, createdAt: true },
    });
    if (!update) return reply.status(404).send({ error: 'CALLOUT_UPDATE_NOT_FOUND' });
    if (Date.now() - update.createdAt.getTime() > CAPTION_EDIT_SECONDS * 1_000) {
      return reply.status(409).send({ error: 'CAPTION_EDIT_WINDOW_CLOSED' });
    }
    const edited = await prisma.calloutUpdate.update({ where: { id: update.id }, data: { caption } });
    return { id: edited.id, caption: edited.caption };
  });

  app.delete('/v1/callouts/:id', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const params = calloutParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_CALLOUT_ID' });
    const updated = await prisma.callout.updateMany({
      where: { id: params.data.id, chainId, userId: session.userId, canonical: true, deletedAt: null },
      data: { deletedAt: new Date(), status: 'deleted' },
    });
    if (updated.count !== 1) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
    await prisma.outboxEvent.create({
      data: {
        dedupKey: `callout.deleted:${params.data.id}:${randomUUID()}`,
        topic: 'callout.update',
        aggregateId: params.data.id,
        chainId,
        payload: { id: params.data.id, status: 'deleted' },
      },
    });
    return reply.status(204).send();
  });

  for (const action of ['like', 'repost'] as const) {
    app.post(`/v1/callouts/:id/${action}`, { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } }, async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      const params = calloutParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'INVALID_CALLOUT_ID' });
      const callout = await findVisibleCallout(params.data.id, chainId);
      if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
      const created = await prisma.$transaction(async transaction => {
        if (action === 'like') {
          const exists = await transaction.like.findUnique({ where: { userId_calloutId: { userId: session.userId, calloutId: callout.id } } });
          if (exists) return false;
          await transaction.like.create({ data: { userId: session.userId, calloutId: callout.id } });
        } else {
          const exists = await transaction.repost.findUnique({ where: { userId_calloutId: { userId: session.userId, calloutId: callout.id } } });
          if (exists) return false;
          await transaction.repost.create({ data: { userId: session.userId, calloutId: callout.id } });
        }
        await createStatsEvent(transaction, callout.id, chainId, action);
        return true;
      });
      return reply.status(created ? 201 : 200).send({ active: true });
    });

    app.delete(`/v1/callouts/:id/${action}`, { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } }, async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      const params = calloutParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'INVALID_CALLOUT_ID' });
      const callout = await findVisibleCallout(params.data.id, chainId);
      if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
      await prisma.$transaction(async transaction => {
        const deleted = action === 'like'
          ? await transaction.like.deleteMany({ where: { userId: session.userId, calloutId: callout.id } })
          : await transaction.repost.deleteMany({ where: { userId: session.userId, calloutId: callout.id } });
        if (deleted.count === 1) await createStatsEvent(transaction, callout.id, chainId, `${action}.removed`);
      });
      return { active: false };
    });
  }

  for (const kind of ['reply', 'quote'] as const) {
    const route = kind === 'reply' ? 'replies' : 'quotes';
    app.post(`/v1/callouts/:id/${route}`, { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      const params = calloutParamsSchema.safeParse(request.params);
      const body = replyBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.status(400).send({ error: `INVALID_${kind.toUpperCase()}` });
      let message: string;
      try {
        message = validatedCaption(body.data.body) ?? '';
      } catch {
        return reply.status(400).send({ error: `INVALID_${kind.toUpperCase()}` });
      }
      if (!message) return reply.status(400).send({ error: `INVALID_${kind.toUpperCase()}` });
      const callout = await findVisibleCallout(params.data.id, chainId);
      if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
      if (body.data.parentId) {
        const parent = await prisma.reply.findFirst({
          where: { id: body.data.parentId, calloutId: callout.id, hidden: false, kind: 'reply' },
          select: { id: true },
        });
        if (!parent) return reply.status(404).send({ error: 'PARENT_REPLY_NOT_FOUND' });
      }
      const created = await prisma.$transaction(async transaction => {
        const row = await transaction.reply.create({
          data: { calloutId: callout.id, userId: session.userId, parentId: body.data.parentId ?? null, kind, body: message },
          include: { user: { select: { id: true, handle: true, name: true, avatarUrl: true, xVerified: true } } },
        });
        await createStatsEvent(transaction, callout.id, chainId, kind);
        return row;
      });
      return reply.status(201).send({
        id: created.id,
        calloutId: created.calloutId,
        parentId: created.parentId,
        kind,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
        user: created.user,
      });
    });
  }

  app.post('/v1/callouts/:id/view', { config: { rateLimit: { max: 240, timeWindow: '1 hour' } } }, async (request, reply) => {
    const params = calloutParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_CALLOUT_ID' });
    const callout = await findVisibleCallout(params.data.id, chainId);
    if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    const fingerprint = sessionToken
      ? `session:${sessionToken}`
      : `visitor:${request.ip}:${request.headers['user-agent'] ?? ''}`;
    const viewerHash = createHash('sha256').update(fingerprint).digest('hex');
    const views = await prisma.$transaction(async transaction => {
      const created = await transaction.viewDaily.createMany({
        data: [{ calloutId: callout.id, day, viewerHash }],
        skipDuplicates: true,
      });
      if (created.count === 1) await createStatsEvent(transaction, callout.id, chainId, 'view');
      return transaction.viewDaily.count({ where: { calloutId: callout.id } });
    });
    return { views };
  });

  app.delete('/v1/callouts/:id/replies/:replyId', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const params = replyParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_REPLY_ID' });
    const callout = await findVisibleCallout(params.data.id, chainId);
    if (!callout) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
    const removed = await prisma.$transaction(async transaction => {
      const row = await transaction.reply.findFirst({
        where: { id: params.data.replyId, calloutId: callout.id, userId: session.userId, hidden: false },
        select: { id: true, kind: true },
      });
      if (!row) return null;
      await transaction.reply.updateMany({ where: { parentId: row.id }, data: { parentId: null } });
      await transaction.reply.delete({ where: { id: row.id } });
      await createStatsEvent(transaction, callout.id, chainId, `${row.kind}.removed`);
      return row;
    });
    if (!removed) return reply.status(404).send({ error: 'REPLY_NOT_FOUND_OR_NOT_OWNED' });
    return reply.status(204).send();
  });
}
