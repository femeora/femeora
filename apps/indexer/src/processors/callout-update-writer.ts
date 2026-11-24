import type { Prisma } from '@fomeora/database';

import type { CalloutUpdateType } from './callout-updates.js';

export interface PersistCalloutUpdateInput {
  readonly chainId: number;
  readonly positionId: bigint;
  readonly positionEventId: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly type: CalloutUpdateType;
}

export async function persistCalloutUpdate(
  transaction: Prisma.TransactionClient,
  input: PersistCalloutUpdateInput,
): Promise<string | null> {
  const callout = await transaction.callout.findUnique({
    where: { chainId_positionId: { chainId: input.chainId, positionId: input.positionId } },
    select: { id: true, pool: { select: { address: true } } },
  });
  if (!callout) return null;
  const update = await transaction.calloutUpdate.upsert({
    where: { positionEventId: input.positionEventId },
    create: {
      calloutId: callout.id,
      positionEventId: input.positionEventId,
      type: input.type,
    },
    update: { type: input.type },
  });
  const dedupKey = `${input.chainId}:${input.transactionHash}:${input.logIndex}:callout.update`;
  await transaction.outboxEvent.upsert({
    where: { dedupKey },
    create: {
      dedupKey,
      topic: 'callout.update',
      aggregateId: callout.pool.address.toLowerCase(),
      chainId: input.chainId,
      blockNumber: input.blockNumber,
      payload: {
        id: update.id,
        calloutId: callout.id,
        positionEventId: input.positionEventId,
        kind: input.type,
        positionId: input.positionId.toString(),
        transactionHash: input.transactionHash,
        blockNumber: input.blockNumber.toString(),
      },
    },
    update: { canonical: true },
  });
  return update.id;
}
