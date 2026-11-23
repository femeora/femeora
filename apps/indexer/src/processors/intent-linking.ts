import type { Prisma } from '@fomeora/database';

interface IntentLinkInput {
  readonly chainId: number;
  readonly poolId: string;
  readonly tag: string;
  readonly owner: string;
  readonly eventTimestamp: Date;
}

export async function resolveCalloutIntent(
  transaction: Prisma.TransactionClient,
  input: IntentLinkInput
) {
  const intent = await transaction.calloutIntent.findFirst({
    where: {
      chainId: input.chainId,
      poolId: input.poolId,
      tag: input.tag,
      kind: 'callout',
      consumedAt: null,
      createdAt: { lte: input.eventTimestamp },
      expiresAt: { gte: input.eventTimestamp },
    },
  });
  if (!intent) return null;
  const linkedWallet = await transaction.wallet.findUnique({
    where: { address: input.owner },
    select: { userId: true },
  });
  return linkedWallet?.userId === intent.userId ? intent : null;
}

export async function resolveTailIntent(
  transaction: Prisma.TransactionClient,
  input: IntentLinkInput & { readonly referrer: string }
) {
  const intent = await transaction.calloutIntent.findFirst({
    where: {
      chainId: input.chainId,
      poolId: input.poolId,
      tag: input.tag,
      kind: 'tail',
      sourceCalloutId: { not: null },
      consumedAt: null,
      createdAt: { lte: input.eventTimestamp },
      expiresAt: { gte: input.eventTimestamp },
    },
  });
  if (!intent?.sourceCalloutId || intent.referrer?.toLowerCase() !== input.referrer.toLowerCase())
    return null;

  const [linkedWallet, sourceCallout] = await Promise.all([
    transaction.wallet.findUnique({
      where: { address: input.owner },
      select: { userId: true },
    }),
    transaction.callout.findFirst({
      where: {
        id: intent.sourceCalloutId,
        chainId: input.chainId,
        poolId: input.poolId,
        canonical: true,
        hidden: false,
        deletedAt: null,
      },
      select: { id: true, userId: true },
    }),
  ]);
  if (
    linkedWallet?.userId !== intent.userId ||
    !sourceCallout ||
    sourceCallout.userId === intent.userId
  )
    return null;
  return { intent, sourceCallout };
}
