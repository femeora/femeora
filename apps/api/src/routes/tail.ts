import { prisma } from '@fomeora/database';
import { classifyRangeSide } from '@fomeora/sdk';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import { visibleCalloutWhere } from '../core/callouts/view.js';
import { createBytes32Tag } from '../core/security/tokens.js';

const TAIL_INTENT_TTL_SECONDS = 10 * 60;
const TAILS_PER_HOUR = 20;
const MIN_BIN = -10_000;
const MAX_BIN = 10_000;
const paramsSchema = z.object({ id: z.string().uuid() });
const modeSchema = z.enum(['same_range', 'same_shape_now']);
const quoteBodySchema = z.object({ mode: modeSchema });
const intentBodySchema = z.object({
  mode: modeSchema,
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase()),
});

function centeredRange(lowerBin: number, upperBin: number, activeBin: number) {
  const width = upperBin - lowerBin;
  let lower = activeBin - Math.floor(width / 2);
  let upper = lower + width;
  if (lower < MIN_BIN) {
    lower = MIN_BIN;
    upper = lower + width;
  }
  if (upper > MAX_BIN) {
    upper = MAX_BIN;
    lower = upper - width;
  }
  return { lowerBin: lower, upperBin: upper };
}

async function tailSource(id: string, chainId: number) {
  return prisma.callout.findFirst({
    where: { id, chainId, ...visibleCalloutWhere },
    select: {
      id: true,
      side: true,
      poolId: true,
      position: {
        select: {
          id: true,
          owner: true,
          status: true,
          lowerBin: true,
          upperBin: true,
          shape: true,
        },
      },
      pool: {
        select: {
          address: true,
          type: true,
          tokenX: true,
          tokenY: true,
          activeBin: true,
          canonical: true,
        },
      },
    },
  });
}

function buildTailQuote(source: NonNullable<Awaited<ReturnType<typeof tailSource>>>, mode: z.infer<typeof modeSchema>) {
  const warnings: string[] = [];
  if (source.position.status !== 'open') warnings.push('SOURCE_POSITION_NOT_OPEN');
  if (source.pool.type !== 'DLMM') {
    return {
      mode,
      pool: source.pool.address,
      poolType: source.pool.type,
      expectedActiveBin: null,
      lowerBin: null,
      upperBin: null,
      shape: source.position.shape,
      requiresTokenX: true,
      requiresTokenY: true,
      warnings,
    };
  }
  const activeBin = source.pool.activeBin;
  if (activeBin === null) {
    warnings.push('ACTIVE_BIN_UNAVAILABLE');
    return {
      mode,
      pool: source.pool.address,
      poolType: source.pool.type,
      expectedActiveBin: null,
      lowerBin: source.position.lowerBin,
      upperBin: source.position.upperBin,
      shape: source.position.shape,
      requiresTokenX: true,
      requiresTokenY: true,
      warnings,
    };
  }
  const currentSourceSide = classifyRangeSide(source.position.lowerBin, source.position.upperBin, activeBin);
  if (source.side && source.side !== currentSourceSide) warnings.push('SOURCE_SIDE_CHANGED');
  if (currentSourceSide !== 'around') warnings.push('SOURCE_RANGE_OUT_OF_RANGE');
  const target = mode === 'same_shape_now'
    ? centeredRange(source.position.lowerBin, source.position.upperBin, activeBin)
    : { lowerBin: source.position.lowerBin, upperBin: source.position.upperBin };
  const targetSide = classifyRangeSide(target.lowerBin, target.upperBin, activeBin);
  return {
    mode,
    pool: source.pool.address,
    poolType: source.pool.type,
    expectedActiveBin: activeBin,
    lowerBin: target.lowerBin,
    upperBin: target.upperBin,
    shape: source.position.shape,
    requiresTokenX: targetSide === 'above' || targetSide === 'around',
    requiresTokenY: targetSide === 'below' || targetSide === 'around',
    warnings,
  };
}

export async function registerTailRoutes(app: FastifyInstance, chainId: number) {
  app.post('/v1/callouts/:id/tail-quote', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = quoteBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_TAIL_QUOTE' });
    const source = await tailSource(params.data.id, chainId);
    if (!source || !source.pool.canonical) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
    return buildTailQuote(source, body.data.mode);
  });

  app.post(
    '/v1/callouts/:id/tail-intent',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
      if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
      const params = paramsSchema.safeParse(request.params);
      const body = intentBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_TAIL_INTENT' });
      const source = await tailSource(params.data.id, chainId);
      if (!source || !source.pool.canonical) return reply.status(404).send({ error: 'CALLOUT_NOT_FOUND' });
      if (source.position.status !== 'open') return reply.status(409).send({ error: 'SOURCE_POSITION_NOT_OPEN' });
      if (!session.user.wallets.some(wallet => wallet.address === body.data.walletAddress)) {
        return reply.status(403).send({ error: 'LINKED_WALLET_REQUIRED' });
      }
      if (source.position.owner === body.data.walletAddress) {
        return reply.status(409).send({ error: 'SELF_TAIL_NOT_ALLOWED' });
      }
      const since = new Date(Date.now() - 60 * 60 * 1_000);
      const [tails, pending] = await Promise.all([
        prisma.tail.count({ where: { tailerUserId: session.userId, createdAt: { gte: since } } }),
        prisma.calloutIntent.count({
          where: {
            userId: session.userId,
            kind: 'tail',
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      ]);
      if (tails + pending >= TAILS_PER_HOUR) return reply.status(429).send({ error: 'TAIL_RATE_LIMIT' });

      const quote = buildTailQuote(source, body.data.mode);
      if (source.pool.type === 'DLMM' && quote.expectedActiveBin === null) {
        return reply.status(409).send({ error: 'ACTIVE_BIN_UNAVAILABLE' });
      }
      const tag = createBytes32Tag();
      const expiresAt = new Date(Date.now() + TAIL_INTENT_TTL_SECONDS * 1_000);
      const intent = await prisma.calloutIntent.create({
        data: {
          userId: session.userId,
          chainId,
          poolId: source.poolId,
          sourceCalloutId: source.id,
          tag,
          kind: 'tail',
          mode: body.data.mode,
          referrer: source.position.owner,
          expiresAt,
        },
        select: { id: true },
      });
      return reply.status(201).send({
        intentId: intent.id,
        tag,
        referrer: source.position.owner,
        referrerPositionId: source.position.id.toString(),
        expiresAt: expiresAt.toISOString(),
        quote,
      });
    },
  );
}
