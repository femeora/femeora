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
  readonly removalBps?: number;
  readonly calloutId?: string;
}

export async function persistCalloutUpdate(
  transaction: Prisma.TransactionClient,
  input: PersistCalloutUpdateInput,
): Promise<string | null> {
  const callout = await transaction.callout.findUnique({
    where: input.calloutId
      ? { id: input.calloutId }
      : { chainId_positionId: { chainId: input.chainId, positionId: input.positionId } },
    select: { id: true, userId: true, pool: { select: { address: true } } },
  });
  if (!callout) return null;
  const existing = await transaction.calloutUpdate.findUnique({
    where: { positionEventId: input.positionEventId },
    select: { id: true },
  });
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
  const shouldAlertTailers = input.type === 'Closed' || input.type === 'Rebalanced'
    || (input.type === 'Removed' && (input.removalBps ?? 0) >= 2_500);
  if (!existing && shouldAlertTailers) {
    const tails = await transaction.tail.findMany({
      where: { calloutId: callout.id, tailerUserId: { not: null } },
      select: { tailerUserId: true },
      distinct: ['tailerUserId'],
    });
    for (const tail of tails) {
      if (!tail.tailerUserId || tail.tailerUserId === callout.userId) continue;
      const notification = await transaction.notification.create({
        data: {
          userId: tail.tailerUserId,
          actorUserId: callout.userId,
          type: input.type === 'Closed' ? 'callout_closed' : input.type === 'Rebalanced' ? 'callout_rebalanced' : 'callout_trimmed',
          entityType: 'callout',
          entityId: callout.id,
          payload: {
            calloutId: callout.id,
            positionEventId: input.positionEventId,
            ...(input.removalBps === undefined ? {} : { removalBps: input.removalBps }),
          },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          dedupKey: `notification:${notification.id}`,
          topic: 'notification.new',
          aggregateId: tail.tailerUserId,
          chainId: input.chainId,
          blockNumber: input.blockNumber,
          payload: {
            notificationId: notification.id,
            userId: tail.tailerUserId,
            type: input.type === 'Closed' ? 'callout_closed' : input.type === 'Rebalanced' ? 'callout_rebalanced' : 'callout_trimmed',
          },
        },
      });
    }
  }
  return update.id;
}
