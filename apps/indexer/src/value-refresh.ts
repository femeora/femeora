import {
  dammPoolAbi,
  dlmmPoolV2Abi,
  positionManagerV2Abi,
  type FomeoraDeployment,
} from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import { priceFromBinX18 } from '@fomeora/sdk';
import type { Address } from 'viem';

import type { IndexerClient } from './chain-client.js';
import {
  calculateDammPositionQuote,
  calculateDlmmPositionQuote,
  type QuoteConfiguration,
} from './processors/position-value.js';

const VALUE_REFRESH_INTERVAL_MS = 30_000;

type ReserveCapLevel = 'normal' | 'warning' | 'critical';

function reserveCapLevel(reserveX: bigint, reserveY: bigint, capX: bigint, capY: bigint) {
  const utilizationX = reserveX * 10_000n / capX;
  const utilizationY = reserveY * 10_000n / capY;
  const utilizationBps = Number(utilizationX > utilizationY ? utilizationX : utilizationY);
  const level: ReserveCapLevel = utilizationBps >= 9_000
    ? 'critical'
    : utilizationBps >= 8_000
      ? 'warning'
      : 'normal';
  return { utilizationBps, level };
}

export async function refreshPoolReserveSnapshots(
  client: IndexerClient,
  chainId: number,
  safeBlock: bigint,
  now = new Date(),
): Promise<{ pools: number; warning: number; critical: number }> {
  const refreshBefore = new Date(now.getTime() - VALUE_REFRESH_INTERVAL_MS);
  const pools = await prisma.pool.findMany({
    where: {
      chainId,
      canonical: true,
      // A newly discovered registry event can be ahead of the confirmation
      // boundary. Calling the pool at an older safe block has no bytecode and
      // must not make the entire indexer cycle unhealthy.
      createdBlock: { lte: safeBlock },
      reserveCapX: { not: null },
      reserveCapY: { not: null },
      OR: [
        { lastReserveRefreshAt: null },
        { lastReserveRefreshAt: { lte: refreshBefore } },
      ],
    },
    select: {
      id: true,
      address: true,
      type: true,
      reserveCapX: true,
      reserveCapY: true,
      reserveX: true,
      reserveY: true,
    },
  });
  let warning = 0;
  let critical = 0;
  for (const pool of pools) {
    const address = pool.address as Address;
    const [reserveX, reserveY] = pool.type === 'DAMM'
      ? await Promise.all([
          client.readContract({ address, abi: dammPoolAbi, functionName: 'reserve0', blockNumber: safeBlock }),
          client.readContract({ address, abi: dammPoolAbi, functionName: 'reserve1', blockNumber: safeBlock }),
        ])
      : await Promise.all([
          client.readContract({ address, abi: dlmmPoolV2Abi, functionName: 'totalReserve0', blockNumber: safeBlock }),
          client.readContract({ address, abi: dlmmPoolV2Abi, functionName: 'totalReserve1', blockNumber: safeBlock }),
        ]);
    const capX = BigInt(pool.reserveCapX!.toString());
    const capY = BigInt(pool.reserveCapY!.toString());
    const current = reserveCapLevel(reserveX, reserveY, capX, capY);
    if (current.level === 'critical') critical += 1;
    else if (current.level === 'warning') warning += 1;
    const previous = pool.reserveX === null || pool.reserveY === null
      ? null
      : reserveCapLevel(
          BigInt(pool.reserveX.toString()),
          BigInt(pool.reserveY.toString()),
          capX,
          capY,
        );
    await prisma.$transaction(async transaction => {
      await transaction.pool.update({
        where: { id: pool.id },
        data: {
          reserveX: reserveX.toString(),
          reserveY: reserveY.toString(),
          reserveUpdatedBlock: safeBlock,
          lastReserveRefreshAt: now,
        },
      });
      if ((previous?.level ?? 'normal') !== current.level) {
        const dedupKey = `${chainId}:${pool.address.toLowerCase()}:pool.cap:${safeBlock}:${current.level}`;
        await transaction.outboxEvent.upsert({
          where: { dedupKey },
          create: {
            dedupKey,
            topic: 'pool.cap',
            aggregateId: pool.address.toLowerCase(),
            chainId,
            blockNumber: safeBlock,
            payload: {
              pool: pool.address.toLowerCase(),
              previousStatus: previous?.level ?? 'unavailable',
              status: current.level,
              utilizationBps: current.utilizationBps,
              reserveX: reserveX.toString(),
              reserveY: reserveY.toString(),
              reserveCapX: capX.toString(),
              reserveCapY: capY.toString(),
              blockNumber: safeBlock.toString(),
            },
          },
          update: { canonical: true },
        });
      }
    });
  }
  return { pools: pools.length, warning, critical };
}

function quoteConfiguration(pool: {
  tokenX: string;
  tokenY: string;
  tokenXDecimals: number | null;
  tokenYDecimals: number | null;
  quoteToken: string | null;
}): QuoteConfiguration | null {
  if (!pool.quoteToken || pool.tokenXDecimals === null || pool.tokenYDecimals === null) return null;
  const quoteToken = pool.quoteToken.toLowerCase();
  if (quoteToken !== pool.tokenX.toLowerCase() && quoteToken !== pool.tokenY.toLowerCase()) return null;
  return {
    quoteIsToken0: quoteToken === pool.tokenX.toLowerCase(),
    decimals0: pool.tokenXDecimals,
    decimals1: pool.tokenYDecimals,
  };
}

export async function refreshPositionValues(
  client: IndexerClient,
  chainId: number,
  safeBlock: bigint,
  deployment: FomeoraDeployment,
  now = new Date(),
): Promise<{ pools: number; positions: number }> {
  const refreshBefore = new Date(now.getTime() - VALUE_REFRESH_INTERVAL_MS);
  const pools = await prisma.pool.findMany({
    where: {
      chainId,
      canonical: true,
      positions: { some: { canonical: true, status: { in: ['open', 'transferred'] } } },
      OR: [{ lastValueRefreshAt: null }, { lastValueRefreshAt: { lte: refreshBefore } }],
    },
    include: {
      bins: true,
      positions: {
        where: { canonical: true, status: { in: ['open', 'transferred'] } },
        include: {
          bins: true,
          events: {
            where: { canonical: true, cashFlowType: 'deposit' },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (pools.length === 0) return { pools: 0, positions: 0 };
  const safeBlockState = await client.getBlock({ blockNumber: safeBlock });
  const valuedAt = new Date(Number(safeBlockState.timestamp) * 1_000);
  let refreshedPositions = 0;

  for (const pool of pools) {
    const quote = quoteConfiguration(pool);
    const values = new Map<bigint, string | null>();
    if (!quote) {
      for (const position of pool.positions) values.set(position.id, null);
    } else if (pool.type === 'DLMM') {
      const bins = new Map(pool.bins.map(bin => [bin.binId, bin]));
      for (const position of pool.positions) {
        values.set(
          position.id,
          calculateDlmmPositionQuote(
            position.bins.map(positionBin => {
              const bin = bins.get(positionBin.binId);
              if (!bin) throw new Error('POSITION_VALUE_BIN_MISSING');
              return {
                shares: BigInt(positionBin.shares.toString()),
                reserve0: BigInt(bin.reserveX.toString()),
                reserve1: BigInt(bin.reserveY.toString()),
                totalShares: BigInt(bin.totalShares.toString()),
                priceX18: priceFromBinX18(bin.binId, pool.binStep),
              };
            }),
            quote,
          ),
        );
      }
    } else {
      const [reserve0, reserve1, totalShares, positionShares] = await Promise.all([
        client.readContract({ address: pool.address as Address, abi: dammPoolAbi, functionName: 'reserve0', blockNumber: safeBlock }),
        client.readContract({ address: pool.address as Address, abi: dammPoolAbi, functionName: 'reserve1', blockNumber: safeBlock }),
        client.readContract({ address: pool.address as Address, abi: dammPoolAbi, functionName: 'totalShares', blockNumber: safeBlock }),
        Promise.all(pool.positions.map(position => client.readContract({
          address: deployment.positionManagerV2,
          abi: positionManagerV2Abi,
          functionName: 'dammShares',
          args: [position.id],
          blockNumber: safeBlock,
        }))),
      ]);
      pool.positions.forEach((position, index) => {
        values.set(
          position.id,
          calculateDammPositionQuote(
            positionShares[index] ?? 0n,
            reserve0,
            reserve1,
            totalShares,
            quote,
          ),
        );
      });
    }

    await prisma.$transaction(async transaction => {
      for (const [positionId, valueQuote] of values) {
        const position = pool.positions.find(candidate => candidate.id === positionId);
        await transaction.position.update({
          where: { chainId_id: { chainId, id: positionId } },
          data: {
            valueQuote,
            valueQuoteUpdatedAt: valuedAt,
            valueQuoteBlock: safeBlock,
            // PositionOpened does not include deposit amounts. Capture the first
            // available canonical valuation (including legacy backfills) as cost basis.
            ...(valueQuote !== null && position?.depositedQuote.toString() === '0' && position.events.length === 0
              ? { openingQuote: valueQuote, depositedQuote: valueQuote }
              : {}),
          },
        });
      }
      await transaction.pool.update({ where: { id: pool.id }, data: { lastValueRefreshAt: now } });
    });
    refreshedPositions += values.size;
  }
  return { pools: pools.length, positions: refreshedPositions };
}
