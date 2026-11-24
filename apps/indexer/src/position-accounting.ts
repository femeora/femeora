import { prisma, Prisma } from '@fomeora/database';

import { positionCashFlowFromPayload } from './processors/position-accounting.js';

const RECONCILE_LIMIT = 500;

export async function aggregatePositionAccounting(
  chainId: number,
  positionIds: readonly bigint[],
): Promise<void> {
  for (const positionId of [...new Set(positionIds)]) {
    const [position, deposits, withdrawals] = await Promise.all([
      prisma.position.findUniqueOrThrow({
        where: { chainId_id: { chainId, id: positionId } },
        select: { openingQuote: true },
      }),
      prisma.positionEvent.aggregate({
        where: { chainId, positionId, canonical: true, cashFlowType: 'deposit' },
        _sum: { amountQuote: true },
      }),
      prisma.positionEvent.aggregate({
        where: { chainId, positionId, canonical: true, cashFlowType: 'withdrawal' },
        _sum: { amountQuote: true },
      }),
    ]);
    const deposited = new Prisma.Decimal(position.openingQuote).add(
      deposits._sum.amountQuote ?? 0,
    );
    await prisma.position.update({
      where: { chainId_id: { chainId, id: positionId } },
      data: {
        depositedQuote: deposited,
        withdrawnQuote: withdrawals._sum.amountQuote ?? 0,
      },
    });
  }
}

/** Backfills pre-upgrade event payloads, then derives balances from canonical rows only. */
export async function reconcilePositionAccounting(chainId: number): Promise<number> {
  const events = await prisma.positionEvent.findMany({
    where: {
      chainId,
      canonical: true,
      amountQuote: null,
      eventType: { in: ['increased', 'decreased'] },
    },
    include: { position: { include: { pool: true } } },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
    take: RECONCILE_LIMIT,
  });
  const touched: bigint[] = [];
  for (const event of events) {
    const pool = event.position.pool;
    const flow = positionCashFlowFromPayload(
      event.eventType as 'increased' | 'decreased',
      event.payload,
      pool.activeBin,
      pool,
    );
    if (!flow) continue;
    await prisma.positionEvent.update({
      where: { id: event.id },
      data: { cashFlowType: flow.direction, amountQuote: flow.amountQuote },
    });
    touched.push(event.positionId);
  }
  await aggregatePositionAccounting(chainId, touched);
  return touched.length;
}
