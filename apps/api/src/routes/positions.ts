import { prisma } from '@fomeora/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase());

function serializePosition(position: Awaited<ReturnType<typeof loadPosition>>) {
  if (!position) return null;
  const { callouts, ...record } = position;
  return {
    ...record,
    id: position.id.toString(),
    depositedQuote: position.depositedQuote.toString(),
    withdrawnQuote: position.withdrawnQuote.toString(),
    earnedQuote: position.earnedQuote.toString(),
    valueQuote: position.valueQuote?.toString() ?? null,
    valueQuoteUpdatedAt: position.valueQuoteUpdatedAt?.toISOString() ?? null,
    valueQuoteBlock: position.valueQuoteBlock?.toString() ?? null,
    inRangeSeconds: position.inRangeSeconds.toString(),
    openSeconds: position.openSeconds.toString(),
    openedAt: position.openedAt.toISOString(),
    closedAt: position.closedAt?.toISOString() ?? null,
    bins: position.bins.map(bin => ({ binId: bin.binId, shares: bin.shares.toString() })),
    pool: { ...position.pool, createdBlock: position.pool.createdBlock.toString() },
    calloutId: callouts[0]?.id ?? null,
  };
}

function loadPosition(chainId: number, id: bigint) {
  return prisma.position.findUnique({
    where: { chainId_id: { chainId, id }, canonical: true },
    include: {
      bins: { orderBy: { binId: 'asc' } },
      pool: true,
      callouts: { where: { canonical: true, deletedAt: null }, select: { id: true }, take: 1 },
    },
  });
}

export async function registerPositionRoutes(app: FastifyInstance, chainId: number) {
  app.get('/v1/positions', async (request, reply) => {
    const query = z
      .object({ owner: addressSchema, limit: z.coerce.number().int().min(1).max(200).default(50) })
      .safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const positions = await prisma.position.findMany({
      where: { chainId, owner: query.data.owner, canonical: true },
      include: {
        bins: { orderBy: { binId: 'asc' } },
        pool: true,
        callouts: { where: { canonical: true, deletedAt: null }, select: { id: true }, take: 1 },
      },
      orderBy: { openedAt: 'desc' },
      take: query.data.limit,
    });
    return { data: positions.map(position => serializePosition(position)) };
  });

  app.get('/v1/positions/:chain/:id', async (request, reply) => {
    const params = z
      .object({
        chain: z.coerce.number().int().positive(),
        id: z.string().regex(/^\d+$/).transform(value => BigInt(value)),
      })
      .safeParse(request.params);
    if (!params.success || params.data.chain !== chainId) {
      return reply.status(400).send({ error: 'INVALID_POSITION' });
    }
    const position = await loadPosition(chainId, params.data.id);
    if (!position) return reply.status(404).send({ error: 'POSITION_NOT_FOUND' });
    return serializePosition(position);
  });
}
