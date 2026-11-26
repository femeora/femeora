import {
  dlmmPoolV2Abi,
  positionManagerV2Abi,
  type FomeoraDeployment,
} from '@fomeora/contracts-sdk';
import { prisma, type Prisma } from '@fomeora/database';
import type { Address } from 'viem';

import type { IndexerClient } from './chain-client.js';
import { rebuildTouchedCandles } from './processors/candles.js';

interface RestoredBin {
  readonly poolId: string;
  readonly binId: number;
  readonly reserveX: string;
  readonly reserveY: string;
  readonly totalShares: string;
}

interface RestoredPosition {
  readonly id: bigint;
  readonly poolId: string;
  readonly owner: string;
  readonly lowerBin: number;
  readonly upperBin: number;
  readonly shape: number;
  readonly tag: string;
  readonly referrer: string;
  readonly open: boolean;
  readonly bins: readonly { binId: number; shares: string }[];
}

interface RestoredPoolActiveBin {
  readonly poolId: string;
  readonly activeBin: number;
}

export async function rollbackOrphanSocialDerivations(
  transaction: Prisma.TransactionClient,
  chainId: number,
  positionIds: readonly bigint[],
  tags: readonly string[]
): Promise<void> {
  if (positionIds.length === 0) return;
  await transaction.tail.deleteMany({
    where: { chainId, positionId: { in: [...positionIds] } },
  });
  if (tags.length > 0) {
    await transaction.calloutIntent.updateMany({
      where: { chainId, tag: { in: [...tags] }, consumedAt: { not: null } },
      data: { consumedAt: null },
    });
  }
  await transaction.position.updateMany({
    where: { chainId, id: { in: [...positionIds] } },
    data: { canonical: false },
  });
  await transaction.callout.updateMany({
    where: { chainId, positionId: { in: [...positionIds] } },
    data: { canonical: false },
  });
}

async function loadPositionTimeline(
  transaction: Prisma.TransactionClient,
  chainId: number,
  positionId: bigint,
  commonBlock: bigint,
  open: boolean
): Promise<{ openedAt: Date; closedAt: Date | null }> {
  const createdEvent = await transaction.positionEvent.findFirst({
    where: {
      chainId,
      positionId,
      eventType: 'created',
      canonical: true,
      blockNumber: { lte: commonBlock },
    },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
    select: { timestamp: true },
  });
  const closedEvent = open
    ? null
    : await transaction.positionEvent.findFirst({
        where: {
          chainId,
          positionId,
          eventType: 'closed',
          canonical: true,
          blockNumber: { lte: commonBlock },
        },
        orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
        select: { timestamp: true },
      });
  if (!createdEvent || (!open && !closedEvent)) throw new Error('REORG_POSITION_TIMELINE_MISSING');
  return { openedAt: createdEvent.timestamp, closedAt: closedEvent?.timestamp ?? null };
}

async function findCommonCheckpoint(client: IndexerClient, chainId: number) {
  const checkpoints = await prisma.canonicalBlock.findMany({
    where: { chainId, canonical: true },
    orderBy: { blockNumber: 'desc' },
  });
  for (const checkpoint of checkpoints) {
    try {
      const block = await client.getBlock({ blockNumber: checkpoint.blockNumber });
      if (block.hash.toLowerCase() === checkpoint.hash.toLowerCase()) return checkpoint;
    } catch {
      // Continue toward an older locally recorded checkpoint.
    }
  }
  return null;
}

async function restoreBins(
  client: IndexerClient,
  blockNumber: bigint,
  bins: readonly {
    poolId: string;
    binId: number;
    pool: { address: string; type: string; createdBlock: bigint };
  }[]
): Promise<readonly RestoredBin[]> {
  return Promise.all(
    bins
      .filter(bin => bin.pool.type === 'DLMM' && bin.pool.createdBlock <= blockNumber)
      .map(async bin => {
        const state = await client.readContract({
          address: bin.pool.address as Address,
          abi: dlmmPoolV2Abi,
          functionName: 'binState',
          args: [bin.binId],
          blockNumber,
        });
        return {
          poolId: bin.poolId,
          binId: bin.binId,
          reserveX: state[0].toString(),
          reserveY: state[1].toString(),
          totalShares: state[2].toString(),
        };
      })
  );
}

async function restorePositions(
  client: IndexerClient,
  manager: Address,
  blockNumber: bigint,
  positions: readonly { id: bigint; poolId: string; owner: string }[]
): Promise<readonly RestoredPosition[]> {
  return Promise.all(
    positions.map(async position => {
      const state = await client.readContract({
        address: manager,
        abi: positionManagerV2Abi,
        functionName: 'positions',
        args: [position.id],
        blockNumber,
      });
      const binIds = await client.readContract({
        address: manager,
        abi: positionManagerV2Abi,
        functionName: 'positionBins',
        args: [position.id],
        blockNumber,
      });
      const bins = await Promise.all(
        binIds.map(async binId => ({
          binId,
          shares: (
            await client.readContract({
              address: manager,
              abi: positionManagerV2Abi,
              functionName: 'binShares',
              args: [position.id, binId],
              blockNumber,
            })
          ).toString(),
        }))
      );
      let owner = position.owner;
      if (state[6]) {
        try {
          owner = (
            await client.readContract({
              address: manager,
              abi: positionManagerV2Abi,
              functionName: 'ownerOf',
              args: [position.id],
              blockNumber,
            })
          ).toLowerCase();
        } catch {
          throw new Error('REORG_OWNER_RESTORE_FAILED');
        }
      }
      return {
        id: position.id,
        poolId: position.poolId,
        owner,
        lowerBin: state[1],
        upperBin: state[2],
        shape: state[3],
        tag: state[4],
        referrer: state[5].toLowerCase(),
        open: state[6],
        bins,
      };
    })
  );
}

async function restorePoolActiveBins(
  client: IndexerClient,
  blockNumber: bigint,
  pools: readonly { id: string; address: string }[]
): Promise<readonly RestoredPoolActiveBin[]> {
  return Promise.all(
    pools.map(async pool => ({
      poolId: pool.id,
      activeBin: await client.readContract({
        address: pool.address as Address,
        abi: dlmmPoolV2Abi,
        functionName: 'activeBin',
        blockNumber,
      }),
    }))
  );
}

export async function ensureCanonicalCursor(
  client: IndexerClient,
  chainId: number,
  deploymentStartBlock: bigint,
  deployment: FomeoraDeployment
): Promise<boolean> {
  const cursor = await prisma.chainCursor.findUnique({ where: { chainId } });
  if (cursor?.lastProcessedBlock === null || cursor?.lastProcessedBlock === undefined) return false;
  if (!cursor.lastProcessedHash) throw new Error('CURSOR_HASH_MISSING');
  const current = await client.getBlock({ blockNumber: cursor.lastProcessedBlock });
  if (current.hash.toLowerCase() === cursor.lastProcessedHash.toLowerCase()) return false;

  const common = await findCommonCheckpoint(client, chainId);
  const commonBlock = common?.blockNumber ?? deploymentStartBlock - 1n;
  const affectedEvents = await prisma.positionEvent.findMany({
    where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
    select: { id: true, positionId: true },
  });
  const affectedSwaps = await prisma.swap.findMany({
    where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
    select: { poolId: true, timestamp: true },
  });
  const affectedPositionIds = [...new Set(affectedEvents.map(event => event.positionId))];
  const restorablePositions = await prisma.position.findMany({
    where: {
      chainId,
      id: { in: affectedPositionIds },
      events: {
        some: { eventType: 'created', canonical: true, blockNumber: { lte: commonBlock } },
      },
    },
    select: { id: true, poolId: true, owner: true },
  });
  const affectedBins = await prisma.bin.findMany({
    where: { updatedBlock: { gt: commonBlock }, pool: { chainId, canonical: true } },
    select: {
      poolId: true,
      binId: true,
      pool: { select: { address: true, type: true, createdBlock: true } },
    },
  });
  const affectedFeeCredits = await prisma.positionFeeCredit.findMany({
    where: { chainId, canonical: true, accrual: { blockNumber: { gt: commonBlock } } },
    select: { positionId: true },
  });
  const restorablePools = await prisma.pool.findMany({
    where: { chainId, type: 'DLMM', canonical: true, createdBlock: { lte: commonBlock } },
    select: { id: true, address: true },
  });
  const restoredBins = common ? await restoreBins(client, commonBlock, affectedBins) : [];
  const restoredPoolActiveBins = common
    ? await restorePoolActiveBins(client, commonBlock, restorablePools)
    : [];
  const restoredPositions = common
    ? await restorePositions(client, deployment.positionManagerV2, commonBlock, restorablePositions)
    : [];
  const restorableIds = new Set(restoredPositions.map(position => position.id));
  const orphanPositionIds = affectedPositionIds.filter(id => !restorableIds.has(id));
  const orphanSocialPositions =
    orphanPositionIds.length === 0
      ? []
      : await prisma.position.findMany({
          where: { chainId, id: { in: orphanPositionIds } },
          select: { id: true, tag: true },
        });

  // Reorg repair deliberately keeps every derived mutation and cursor rewind atomic.
  // eslint-disable-next-line complexity
  await prisma.$transaction(async transaction => {
    if (affectedEvents.length > 0) {
      await transaction.calloutUpdate.deleteMany({
        where: { positionEventId: { in: affectedEvents.map(event => event.id) } },
      });
    }
    await transaction.swap.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.binFeeAccrual.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.tailReward.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.positionShareCheckpoint.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.positionFeeCredit.updateMany({
      where: {
        chainId,
        canonical: true,
        accrual: { blockNumber: { gt: commonBlock } },
      },
      data: { canonical: false },
    });
    for (const positionId of [...new Set(affectedFeeCredits.map(credit => credit.positionId))]) {
      const aggregate = await transaction.positionFeeCredit.aggregate({
        where: { chainId, positionId, canonical: true },
        _sum: { amountQuote: true },
      });
      await transaction.position.updateMany({
        where: { chainId, id: positionId },
        data: { earnedQuote: aggregate._sum.amountQuote?.toString() ?? '0' },
      });
    }
    await transaction.positionEvent.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    for (const positionId of affectedPositionIds) {
      const [position, deposits, withdrawals] = await Promise.all([
        transaction.position.findUnique({
          where: { chainId_id: { chainId, id: positionId } },
          select: { openingQuote: true },
        }),
        transaction.positionEvent.aggregate({
          where: { chainId, positionId, canonical: true, cashFlowType: 'deposit' },
          _sum: { amountQuote: true },
        }),
        transaction.positionEvent.aggregate({
          where: { chainId, positionId, canonical: true, cashFlowType: 'withdrawal' },
          _sum: { amountQuote: true },
        }),
      ]);
      if (!position) continue;
      await transaction.position.update({
        where: { chainId_id: { chainId, id: positionId } },
        data: {
          depositedQuote: position.openingQuote.add(deposits._sum.amountQuote ?? 0),
          withdrawnQuote: withdrawals._sum.amountQuote ?? 0,
        },
      });
    }
    await transaction.canonicalBlock.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.outboxEvent.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.curveTrade.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.launchpadRevenue.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.launchpadStatusEvent.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    await transaction.graduation.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    const orphanedLaunchAssets = await transaction.launch.findMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      select: { token: true },
    });
    await transaction.launch.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    if (orphanedLaunchAssets.length > 0) {
      await transaction.assetCatalog.deleteMany({
        where: {
          chainId,
          source: 'launchpad',
          address: { in: orphanedLaunchAssets.map(asset => asset.token) },
        },
      });
    }
    await transaction.launchpad.updateMany({
      where: { chainId, canonical: true, blockNumber: { gt: commonBlock } },
      data: { canonical: false },
    });
    const survivingLaunchpads = await transaction.launchpad.findMany({
      where: { chainId, canonical: true },
      select: { launchpadId: true },
    });
    for (const launchpad of survivingLaunchpads) {
      const latestStatus = await transaction.launchpadStatusEvent.findFirst({
        where: {
          chainId,
          launchpadId: launchpad.launchpadId,
          canonical: true,
          blockNumber: { lte: commonBlock },
        },
        orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
        select: { active: true },
      });
      await transaction.launchpad.update({
        where: { chainId_launchpadId: { chainId, launchpadId: launchpad.launchpadId } },
        data: { active: latestStatus?.active ?? true },
      });
    }
    const survivingLaunches = await transaction.launch.findMany({
      where: { chainId, canonical: true },
      include: { launchpad: true },
    });
    for (const launch of survivingLaunches) {
      const [latestTrade, graduation] = await Promise.all([
        transaction.curveTrade.findFirst({
          where: {
            chainId,
            launchId: launch.launchId,
            canonical: true,
            blockNumber: { lte: commonBlock },
          },
          orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
        }),
        transaction.graduation.findFirst({
          where: {
            chainId,
            launchId: launch.launchId,
            canonical: true,
            blockNumber: { lte: commonBlock },
          },
        }),
      ]);
      await transaction.launch.update({
        where: { chainId_launchId: { chainId, launchId: launch.launchId } },
        data: graduation
          ? { status: 'graduated', progressPips: 1_000_000, quoteReserve: '0', tokenInventory: '0' }
          : {
              status: 'curve',
              quoteReserve: latestTrade?.quoteReserve.toFixed(0) ?? '0',
              tokenInventory:
                latestTrade?.tokenInventory.toFixed(0) ??
                launch.launchpad.curveTokenSupply.toFixed(0),
              progressPips: latestTrade?.progressPips ?? 0,
            },
      });
    }
    await transaction.pool.updateMany({
      where: { chainId, canonical: true, createdBlock: { gt: commonBlock } },
      data: { canonical: false },
    });
    const swapTimestampsByPool = new Map<string, Date[]>();
    for (const swap of affectedSwaps) {
      const timestamps = swapTimestampsByPool.get(swap.poolId) ?? [];
      timestamps.push(swap.timestamp);
      swapTimestampsByPool.set(swap.poolId, timestamps);
    }
    for (const [poolId, timestamps] of swapTimestampsByPool) {
      await rebuildTouchedCandles(transaction, poolId, timestamps);
    }
    if (orphanPositionIds.length > 0) {
      const orphanTags = [
        ...new Set(
          orphanSocialPositions
            .map(position => position.tag)
            .filter((tag): tag is string => tag !== null)
        ),
      ];
      await rollbackOrphanSocialDerivations(transaction, chainId, orphanPositionIds, orphanTags);
    }
    for (const bin of restoredBins) {
      await transaction.bin.update({
        where: { poolId_binId: { poolId: bin.poolId, binId: bin.binId } },
        data: {
          reserveX: bin.reserveX,
          reserveY: bin.reserveY,
          totalShares: bin.totalShares,
          updatedBlock: commonBlock,
        },
      });
    }
    for (const pool of restoredPoolActiveBins) {
      await transaction.pool.update({
        where: { id: pool.poolId },
        data: { activeBin: pool.activeBin, lastValueRefreshAt: null },
      });
    }
    for (const position of restoredPositions) {
      const timeline = await loadPositionTimeline(
        transaction,
        chainId,
        position.id,
        commonBlock,
        position.open
      );
      await transaction.position.update({
        where: { chainId_id: { chainId, id: position.id } },
        data: {
          poolId: position.poolId,
          owner: position.owner,
          lowerBin: position.lowerBin,
          upperBin: position.upperBin,
          shape: position.shape,
          tag: position.tag,
          referrer: position.referrer,
          status: position.open ? 'open' : 'closed',
          openedAt: timeline.openedAt,
          closedAt: timeline.closedAt,
          valueQuote: position.open ? null : '0',
          valueQuoteUpdatedAt: position.open ? null : timeline.closedAt,
          valueQuoteBlock: null,
          canonical: true,
        },
      });
      await transaction.positionBin.deleteMany({ where: { chainId, positionId: position.id } });
      if (position.bins.length > 0) {
        await transaction.positionBin.createMany({
          data: position.bins.map(bin => ({
            chainId,
            positionId: position.id,
            poolId: position.poolId,
            binId: bin.binId,
            shares: bin.shares,
          })),
        });
      }
    }
    await transaction.chainCursor.update({
      where: { chainId },
      data: {
        nextBlock: commonBlock + 1n,
        lastProcessedBlock: common?.blockNumber ?? null,
        lastProcessedHash: common?.hash ?? null,
      },
    });
    await transaction.indexerHealth.updateMany({
      where: { chainId },
      data: { lastStatsRollupAt: null, lastReputationRollupAt: null },
    });
  });
  return true;
}
