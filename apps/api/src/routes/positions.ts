import { prisma } from '@fomeora/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { serializePool } from './pools.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase());

type PoolIdentity = {
  address: string;
  canonical: boolean;
  type: string;
  tokenX: string;
  tokenY: string;
};

type DecimalValue = { toString(): string; toFixed?(): string };

function decimalString(value: DecimalValue): string {
  return value.toFixed ? value.toFixed() : value.toString();
}

function marketKey(pool: Pick<PoolIdentity, 'type' | 'tokenX' | 'tokenY'>): string {
  return `${pool.type}:${[pool.tokenX.toLowerCase(), pool.tokenY.toLowerCase()].sort().join(':')}`;
}

function replacementAddress(pool: PoolIdentity, canonicalPools: readonly PoolIdentity[]): string | null {
  if (pool.canonical) return null;
  return canonicalPools.find(candidate => candidate.canonical && marketKey(candidate) === marketKey(pool))?.address ?? null;
}

export function serializePosition(
  position: Awaited<ReturnType<typeof loadPosition>>,
  replacementPoolAddress: string | null = null,
) {
  if (!position) return null;
  const { callouts, ...record } = position;
  return {
    ...record,
    id: position.id.toString(),
    depositedQuote: decimalString(position.depositedQuote),
    withdrawnQuote: decimalString(position.withdrawnQuote),
    earnedQuote: decimalString(position.earnedQuote),
    valueQuote: position.valueQuote ? decimalString(position.valueQuote) : null,
    valueQuoteUpdatedAt: position.valueQuoteUpdatedAt?.toISOString() ?? null,
    valueQuoteBlock: position.valueQuoteBlock?.toString() ?? null,
    inRangeSeconds: position.inRangeSeconds.toString(),
    openSeconds: position.openSeconds.toString(),
    openedAt: position.openedAt.toISOString(),
    closedAt: position.closedAt?.toISOString() ?? null,
    bins: position.bins.map(bin => ({ binId: bin.binId, shares: bin.shares.toString() })),
    pool: serializePool(position.pool),
    calloutId: callouts[0]?.id ?? null,
    poolCanonical: position.pool.canonical,
    replacementPoolAddress,
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
      .object({
        owner: addressSchema.optional(),
        pool: addressSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .refine(value => value.owner || value.pool, { message: 'OWNER_OR_POOL_REQUIRED' })
      .safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'INVALID_QUERY' });
    const positions = await prisma.position.findMany({
      where: {
        chainId,
        canonical: true,
        ...(query.data.owner ? { owner: query.data.owner } : {}),
        ...(query.data.pool ? { pool: { address: query.data.pool } } : {}),
      },
      include: {
        bins: { orderBy: { binId: 'asc' } },
        pool: true,
        callouts: { where: { canonical: true, deletedAt: null }, select: { id: true }, take: 1 },
      },
      orderBy: { openedAt: 'desc' },
      take: query.data.limit,
    });
    const canonicalPools = await prisma.pool.findMany({
      where: { chainId, canonical: true },
      select: { address: true, canonical: true, type: true, tokenX: true, tokenY: true },
    });
    return {
      data: positions.map(position => serializePosition(
        position,
        replacementAddress(position.pool, canonicalPools),
      )),
    };
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
    const replacement = position.pool.canonical
      ? null
      : await prisma.pool.findFirst({
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
    return serializePosition(position, replacement?.address ?? null);
  });
}
