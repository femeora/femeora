import { createHash } from 'node:crypto';

import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { SESSION_COOKIE_NAME } from '../core/auth/session.js';
import {
  ConnectionLimiter,
  formatSseEvent,
  type EventFilter,
  latestOutboxEventId,
  OutboxWakeup,
  parseLastEventId,
  readOutboxEvents,
  resolveInitialEventId,
  SSE_HEARTBEAT_MS,
} from '../core/realtime/outbox.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase());
const limiter = new ConnectionLimiter();

function connectionKey(request: FastifyRequest): string {
  const session = request.cookies[SESSION_COOKIE_NAME];
  return session
    ? `session:${createHash('sha256').update(session).digest('hex')}`
    : `ip:${request.ip}`;
}

async function streamEvents(
  request: FastifyRequest,
  reply: FastifyReply,
  wakeup: OutboxWakeup,
  filter: EventFilter,
): Promise<void> {
  const header = request.headers['last-event-id'];
  const rawLastEventId = Array.isArray(header) ? header[0] : header;
  const cursor = parseLastEventId(rawLastEventId);
  if (rawLastEventId !== undefined && cursor === null) {
    await reply.status(400).send({ error: 'INVALID_LAST_EVENT_ID' });
    return;
  }
  const limiterKey = connectionKey(request);
  if (!limiter.acquire(limiterKey)) {
    reply.header('retry-after', '15');
    await reply.status(429).send({ error: 'SSE_CONNECTION_LIMIT' });
    return;
  }

  let initialId: bigint;
  try {
    initialId = await resolveInitialEventId(cursor, () => latestOutboxEventId(filter));
  } catch {
    limiter.release(limiterKey);
    await reply.status(503).send({ error: 'STREAM_UNAVAILABLE' });
    return;
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'content-type': 'text/event-stream; charset=utf-8',
    'x-accel-buffering': 'no',
  });
  reply.raw.flushHeaders();

  const abort = new AbortController();
  let lastId = initialId;
  let lastWrite = Date.now();
  const close = () => abort.abort();
  request.raw.once('close', close);

  try {
    reply.raw.write(': connected\n\n');
    while (!abort.signal.aborted) {
      const events = await readOutboxEvents(lastId, filter);
      for (const event of events) {
        if (abort.signal.aborted) break;
        reply.raw.write(formatSseEvent(event));
        lastId = event.id;
        lastWrite = Date.now();
      }
      if (events.length > 0) continue;
      const heartbeatIn = Math.max(1, SSE_HEARTBEAT_MS - (Date.now() - lastWrite));
      await wakeup.wait(abort.signal, heartbeatIn);
      if (!abort.signal.aborted && Date.now() - lastWrite >= SSE_HEARTBEAT_MS) {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        lastWrite = Date.now();
      }
    }
  } catch {
    if (!reply.raw.destroyed) {
      reply.raw.write('event: error\ndata: {"error":"STREAM_UNAVAILABLE"}\n\n');
    }
  } finally {
    request.raw.off('close', close);
    limiter.release(limiterKey);
    if (!reply.raw.destroyed) reply.raw.end();
  }
}

export async function registerRealtimeRoutes(app: FastifyInstance, chainId: number, wakeup: OutboxWakeup) {
  app.get('/v1/feed/stream', async (request, reply) =>
    streamEvents(request, reply, wakeup, {
      chainId,
      topics: ['callout.new', 'callout.update', 'callout.stats'],
    }),
  );

  app.get('/v1/pools/:pool/stream', async (request, reply) => {
    const parsed = z.object({ pool: addressSchema }).safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_POOL_ADDRESS' });
    const pool = await prisma.pool.findFirst({
      where: { chainId, address: parsed.data.pool, canonical: true },
      select: { id: true },
    });
    if (!pool) return reply.status(404).send({ error: 'POOL_NOT_FOUND' });
    return streamEvents(request, reply, wakeup, {
      chainId,
      topics: [
        'pool.swap',
        'pool.cap',
        'pool.reference',
        'position.created',
        'position.increased',
        'position.decreased',
        'position.closed',
        'position.transferred',
        'callout.new',
        'callout.update',
        'callout.stats',
      ],
      aggregateId: parsed.data.pool,
    });
  });

  app.get('/v1/positions/:owner/stream', async (request, reply) => {
    const parsed = z.object({ owner: addressSchema }).safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_WALLET_ADDRESS' });
    return streamEvents(request, reply, wakeup, {
      chainId,
      topics: [
        'position.created',
        'position.increased',
        'position.decreased',
        'position.closed',
        'position.transferred',
      ],
      owner: parsed.data.owner,
    });
  });
}
