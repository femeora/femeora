import { prisma, Prisma } from '@fomeora/database';
import { classifyRangeSide, computeCalloutScore } from '@fomeora/sdk';

import { calculateAlwaysInRangeClock, calculateRangeClock, type RangeClockSwap } from './processors/range-clock.js';

const ROLLUP_INTERVAL_MS = 60_000;
const FRESH_WALLET_MS = 7 * 24 * 60 * 60 * 1_000;
const QUICK_EXIT_MS = 30 * 60 * 1_000;
const WINDOWS = [
  { name: '24h', milliseconds: 24 * 60 * 60 * 1_000 },
  { name: '7d', milliseconds: 7 * 24 * 60 * 60 * 1_000 },
  { name: '30d', milliseconds: 30 * 24 * 60 * 60 * 1_000 },
  { name: 'all', milliseconds: null },
] as const;

function quickExitMinutes(callout: {
  createdAt: Date;
  position: { events: readonly { eventType: string; timestamp: Date; payload: Prisma.JsonValue }[] };
}): number | null {
  for (const event of callout.position.events) {
    const elapsed = event.timestamp.getTime() - callout.createdAt.getTime();
    if (elapsed < 0 || elapsed > QUICK_EXIT_MS) continue;
    if (event.eventType === 'closed') return Math.floor(elapsed / 60_000);
    const payload = event.payload;
    if (
      event.eventType === 'decreased' &&
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload) &&
      typeof payload.bps === 'number' &&
      payload.bps >= 5_000
    ) return Math.floor(elapsed / 60_000);
  }
  return null;
}

function oppositeSide(
  callout: { side: string | null; sizeAtPost: Prisma.Decimal | null; poolId: string; user: { wallets: readonly { address: string }[] } },
  positions: readonly {
    poolId: string;
    owner: string;
    lowerBin: number;
    upperBin: number;
    valueQuote: Prisma.Decimal | null;
    pool: { activeBin: number | null };
  }[],
): boolean | null {
  if ((callout.side !== 'below' && callout.side !== 'above') || !callout.sizeAtPost) return null;
  const owners = new Set(callout.user.wallets.map(wallet => wallet.address.toLowerCase()));
  let knownValue = new Prisma.Decimal(0);
  let hasUnknownValue = false;
  for (const position of positions) {
    if (position.poolId !== callout.poolId || !owners.has(position.owner.toLowerCase())) continue;
    if (position.pool.activeBin === null) continue;
    const side = classifyRangeSide(position.lowerBin, position.upperBin, position.pool.activeBin);
    if ((callout.side === 'below' && side !== 'above') || (callout.side === 'above' && side !== 'below')) continue;
    if (position.valueQuote === null) hasUnknownValue = true;
    else knownValue = knownValue.add(position.valueQuote);
  }
  if (knownValue.greaterThanOrEqualTo(callout.sizeAtPost.mul('0.5'))) return true;
  return hasUnknownValue ? null : false;
}

function inRangeRatio(
  callout: {
    createdAt: Date;
    position: { openedAt: Date; closedAt: Date | null; lowerBin: number; upperBin: number };
    pool: { id: string; type: string; initialActiveBin: number | null };
  },
  cutoff: Date | null,
  now: Date,
  swapsByPool: ReadonlyMap<string, readonly RangeClockSwap[]>,
): { inRange: bigint; open: bigint } {
  const openedAt = new Date(Math.max(
    callout.createdAt.getTime(),
    callout.position.openedAt.getTime(),
    cutoff?.getTime() ?? 0,
  ));
  if (callout.pool.type === 'DAMM') {
    const clock = calculateAlwaysInRangeClock(openedAt, callout.position.closedAt, now);
    return { inRange: clock.inRangeSeconds, open: clock.openSeconds };
  }
  if (callout.pool.initialActiveBin === null) return { inRange: 0n, open: 0n };
  const clock = calculateRangeClock(
    { ...callout.position, openedAt },
    callout.pool.initialActiveBin,
    swapsByPool.get(callout.pool.id) ?? [],
    now,
  );
  return { inRange: clock.inRangeSeconds, open: clock.openSeconds };
}

// Branches mirror independently auditable window, signal, and canonical-data rules.
// eslint-disable-next-line complexity
export async function rollupUserStats(chainId: number, now = new Date()): Promise<{ users: number; rows: number }> {
  const health = await prisma.indexerHealth.findUnique({ where: { chainId }, select: { lastStatsRollupAt: true } });
  if (health?.lastStatsRollupAt && now.getTime() - health.lastStatsRollupAt.getTime() < ROLLUP_INTERVAL_MS) {
    return { users: 0, rows: 0 };
  }
  const [callouts, positions, swaps] = await Promise.all([
    prisma.callout.findMany({
      where: { chainId, canonical: true, hidden: false, deletedAt: null, position: { canonical: true, status: { not: 'transferred' } } },
      include: {
        user: { include: { wallets: true } },
        pool: true,
        position: {
          include: {
            feeCredits: { where: { canonical: true } },
            events: { where: { canonical: true }, orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }] },
          },
        },
        _count: { select: { tails: true } },
      },
    }),
    prisma.position.findMany({
      where: { chainId, canonical: true, status: { in: ['open', 'closed'] } },
      select: { poolId: true, owner: true, lowerBin: true, upperBin: true, valueQuote: true, pool: { select: { activeBin: true } } },
    }),
    prisma.swap.findMany({
      where: { chainId, canonical: true, activeBinBefore: { not: null }, activeBinAfter: { not: null } },
      orderBy: [{ blockNumber: 'asc' }, { transactionIndex: 'asc' }, { logIndex: 'asc' }],
      select: { poolId: true, timestamp: true, activeBinBefore: true, activeBinAfter: true, blockNumber: true, transactionIndex: true, logIndex: true },
    }),
  ]);
  const swapsByPool = new Map<string, RangeClockSwap[]>();
  for (const swap of swaps) {
    if (swap.activeBinBefore === null || swap.activeBinAfter === null) continue;
    const rows = swapsByPool.get(swap.poolId) ?? [];
    rows.push({ ...swap, activeBinBefore: swap.activeBinBefore, activeBinAfter: swap.activeBinAfter });
    swapsByPool.set(swap.poolId, rows);
  }

  const quickExits = new Map<string, number | null>();
  const oppositeSides = new Map<string, boolean | null>();
  const freshWallets = new Map<string, boolean>();
  for (const callout of callouts) {
    quickExits.set(callout.id, quickExitMinutes(callout));
    oppositeSides.set(callout.id, oppositeSide(callout, positions));
    const ownerWallet = callout.user.wallets.find(wallet => wallet.address.toLowerCase() === callout.position.owner.toLowerCase());
    freshWallets.set(callout.id, Boolean(ownerWallet && now.getTime() - ownerWallet.linkedAt.getTime() < FRESH_WALLET_MS));
  }

  const rows: Array<{
    userId: string;
    window: string;
    callouts: number;
    earnedQuote: Prisma.Decimal;
    avgInRange: Prisma.Decimal;
    tailers: number;
    quickExits: number;
    score: Prisma.Decimal;
    rank: number;
  }> = [];
  for (const window of WINDOWS) {
    const cutoff = window.milliseconds === null ? null : new Date(now.getTime() - window.milliseconds);
    const byUser = new Map<string, typeof rows[number]>();
    for (const callout of callouts) {
      if (cutoff && callout.createdAt < cutoff) continue;
      const row = byUser.get(callout.userId) ?? {
        userId: callout.userId,
        window: window.name,
        callouts: 0,
        earnedQuote: new Prisma.Decimal(0),
        avgInRange: new Prisma.Decimal(0),
        tailers: 0,
        quickExits: 0,
        score: new Prisma.Decimal(0),
        rank: 0,
      };
      row.callouts += 1;
      row.tailers += callout._count.tails;
      if (quickExits.get(callout.id) !== null) row.quickExits += 1;
      for (const credit of callout.position.feeCredits) {
        if ((!cutoff || credit.timestamp >= cutoff) && credit.amountQuote) {
          row.earnedQuote = row.earnedQuote.add(credit.amountQuote);
        }
      }
      const clock = inRangeRatio(callout, cutoff, now, swapsByPool);
      const previousOpen = Number(row.avgInRange.toString());
      row.avgInRange = new Prisma.Decimal(previousOpen + Number(clock.inRange) / Math.max(Number(clock.open), 1));
      byUser.set(callout.userId, row);
    }
    for (const row of byUser.values()) {
      const userCallouts = callouts.filter(callout => callout.userId === row.userId && (!cutoff || callout.createdAt >= cutoff));
      const averageRatio = row.callouts === 0 ? 0 : Number(row.avgInRange.toString()) / row.callouts;
      row.avgInRange = new Prisma.Decimal((averageRatio * 100).toFixed(2));
      const size = userCallouts.reduce((sum, callout) => sum + Number((callout.sizeAtPost ?? callout.position.depositedQuote).toString()), 0);
      const hasOpposite = userCallouts.some(callout => oppositeSides.get(callout.id) === true);
      row.score = new Prisma.Decimal(computeCalloutScore({
        earnedUsdWindow: Number(row.earnedQuote.toString()),
        sizeUsd: size,
        inRangeRatioWindow: averageRatio,
        tailersCount: row.tailers,
        hasQuickExit: row.quickExits > 0,
        hasOppositeSideLiquidity: hasOpposite,
      }).toString());
      rows.push(row);
    }
    rows.filter(row => row.window === window.name)
      .sort((left, right) => right.score.comparedTo(left.score) || right.earnedQuote.comparedTo(left.earnedQuote) || left.userId.localeCompare(right.userId))
      .forEach((row, index) => { row.rank = index + 1; });
  }

  await prisma.$transaction(async transaction => {
    for (const callout of callouts) {
      await transaction.callout.update({
        where: { id: callout.id },
        data: {
          quickExitMinutes: quickExits.get(callout.id) ?? null,
          hasOppositeSide: oppositeSides.get(callout.id) ?? null,
          isFreshWallet: freshWallets.get(callout.id) ?? false,
          isDevOrTopHolder: null,
        },
      });
    }
    // Each environment has its own database; replace the complete authoritative snapshot.
    await transaction.userStat.deleteMany();
    for (const row of rows) {
      await transaction.userStat.upsert({
        where: { userId_window: { userId: row.userId, window: row.window } },
        create: row,
        update: row,
      });
    }
    await transaction.indexerHealth.update({ where: { chainId }, data: { lastStatsRollupAt: now } });
  });
  return { users: new Set(rows.map(row => row.userId)).size, rows: rows.length };
}
