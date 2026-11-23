import { poolFactoryAbi, type FomeoraDeployment } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { IndexerEnvironment } from '@fomeora/env';
import {
  classifyRangeSide,
  convertTokenAmountAtPrice,
  priceFromBinX18,
  rawUnitsToDecimal,
} from '@fomeora/sdk';
import type { Address } from 'viem';

import type { IndexerChainState, IndexerClient } from './chain-client.js';
import { collectPoolEvents, type PoolDescriptor } from './pool-events.js';
import { collectPositionEvents, collectPositionShareEvents } from './position-events.js';
import { persistCalloutUpdate } from './processors/callout-update-writer.js';
import { calloutUpdateEventKey, classifyCalloutUpdates } from './processors/callout-updates.js';
import { rebuildTouchedCandles } from './processors/candles.js';
import {
  projectPositionFeeCredits,
  type FeeAccrualEvent,
  type PositionShareChange,
} from './processors/fee-credits.js';
import { resolveCalloutIntent, resolveTailIntent } from './processors/intent-linking.js';
import {
  calculateAlwaysInRangeClock,
  calculateRangeClock,
  type RangeClockSwap,
} from './processors/range-clock.js';
import { ensureCanonicalCursor } from './reorg.js';

interface BackfillResult {
  readonly batches: number;
  readonly poolsDiscovered: number;
  readonly binsProjected: number;
  readonly binFeesProjected: number;
  readonly swapsProjected: number;
  readonly positionEventsProjected: number;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

const erc20DecimalsAbi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

interface FeeAccountingPool {
  readonly tokenX: string;
  readonly tokenY: string;
  readonly tokenXDecimals: number | null;
  readonly tokenYDecimals: number | null;
  readonly quoteToken: string | null;
  readonly binStep: number;
}

function quoteAmountForCredit(
  amountRaw: bigint,
  tokenIn: string,
  binId: number,
  pool: FeeAccountingPool
): string | null {
  if (!pool.quoteToken || pool.tokenXDecimals === null || pool.tokenYDecimals === null) return null;
  const normalizedToken = tokenIn.toLowerCase();
  const quoteToken = pool.quoteToken.toLowerCase();
  let quoteRaw: bigint;
  let quoteDecimals: number;
  if (normalizedToken === quoteToken) {
    quoteRaw = amountRaw;
    quoteDecimals = quoteToken === pool.tokenX ? pool.tokenXDecimals : pool.tokenYDecimals;
  } else {
    const price = priceFromBinX18(binId, pool.binStep);
    if (normalizedToken === pool.tokenX && quoteToken === pool.tokenY) {
      quoteRaw = convertTokenAmountAtPrice(
        amountRaw,
        price,
        true,
        pool.tokenXDecimals,
        pool.tokenYDecimals
      );
      quoteDecimals = pool.tokenYDecimals;
    } else if (normalizedToken === pool.tokenY && quoteToken === pool.tokenX) {
      quoteRaw = convertTokenAmountAtPrice(
        amountRaw,
        price,
        false,
        pool.tokenXDecimals,
        pool.tokenYDecimals
      );
      quoteDecimals = pool.tokenXDecimals;
    } else {
      return null;
    }
  }
  return rawUnitsToDecimal(quoteRaw, quoteDecimals, 18);
}

function requireMinedValue<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`UNMINED_LOG_${field}`);
  return value;
}

function requireInitialActiveBin(value: number | null): number {
  if (value === null) throw new Error('RANGE_CLOCK_INITIAL_BIN_MISSING');
  return value;
}

function configuredQuoteToken(
  token0: Address,
  token1: Address,
  quoteToken: string | undefined
): string | null {
  if (!quoteToken) return null;
  const configured = quoteToken.toLowerCase();
  return token0.toLowerCase() === configured || token1.toLowerCase() === configured
    ? configured
    : null;
}

function projectedPositionStatus(
  kind: 'created' | 'increased' | 'decreased' | 'closed' | 'transferred'
) {
  if (kind === 'closed') return 'closed';
  if (kind === 'transferred') return 'transferred';
  return 'open';
}

export async function backfillPoolRegistry(
  client: IndexerClient,
  environment: IndexerEnvironment,
  chain: IndexerChainState,
  deployment: FomeoraDeployment
): Promise<BackfillResult> {
  await ensureCanonicalCursor(client, chain.chainId, chain.deploymentStartBlock, deployment);

  const cursor = await prisma.chainCursor.upsert({
    where: { chainId: chain.chainId },
    create: { chainId: chain.chainId, nextBlock: chain.deploymentStartBlock },
    update: {},
  });
  const firstBlock = cursor.nextBlock;
  let nextBlock = firstBlock;
  let batches = 0;
  let poolsDiscovered = 0;
  let binsProjected = 0;
  let binFeesProjected = 0;
  let swapsProjected = 0;
  let positionEventsProjected = 0;

  while (nextBlock <= chain.safeBlock) {
    const configuredEnd = nextBlock + BigInt(environment.INDEXER_BATCH_SIZE) - 1n;
    const endBlock = configuredEnd < chain.safeBlock ? configuredEnd : chain.safeBlock;
    const [logs, initializedLogs, end] = await Promise.all([
      client.getContractEvents({
        address: deployment.poolFactory,
        abi: poolFactoryAbi,
        eventName: 'PoolCreated',
        fromBlock: nextBlock,
        toBlock: endBlock,
        strict: true,
      }),
      client.getContractEvents({
        address: deployment.poolFactory,
        abi: poolFactoryAbi,
        eventName: 'DlmmPoolInitialized',
        fromBlock: nextBlock,
        toBlock: endBlock,
        strict: true,
      }),
      client.getBlock({ blockNumber: endBlock }),
    ]);

    const existingPools = await prisma.pool.findMany({
      where: { chainId: chain.chainId, canonical: true },
    });
    const descriptorByAddress = new Map<string, PoolDescriptor>();
    for (const pool of existingPools) {
      descriptorByAddress.set(pool.address, {
        address: pool.address as Address,
        type: pool.type as 'DAMM' | 'DLMM',
        tokenX: pool.tokenX as Address,
        tokenY: pool.tokenY as Address,
      });
    }
    for (const log of logs) {
      descriptorByAddress.set(log.args.pool.toLowerCase(), {
        address: log.args.pool,
        type: Number(log.args.key.model) === 0 ? 'DAMM' : 'DLMM',
        tokenX: log.args.key.token0,
        tokenY: log.args.key.token1,
      });
    }
    const activeBinByAddress = new Map(
      existingPools.map(pool => [pool.address.toLowerCase(), pool.activeBin])
    );
    const initialActiveBinByAddress = new Map(
      initializedLogs.map(log => [
        log.args.pool.toLowerCase(),
        Number(log.args.initialActiveBin),
      ])
    );
    for (const log of logs) {
      if (Number(log.args.key.model) !== 1) continue;
      const initialActiveBin = initialActiveBinByAddress.get(log.args.pool.toLowerCase());
      if (initialActiveBin === undefined) throw new Error('INITIAL_ACTIVE_BIN_EVENT_MISSING');
      activeBinByAddress.set(log.args.pool.toLowerCase(), initialActiveBin);
    }
    const tokenDecimals = new Map<string, number>();
    for (const pool of existingPools) {
      if (pool.tokenXDecimals !== null) tokenDecimals.set(pool.tokenX, pool.tokenXDecimals);
      if (pool.tokenYDecimals !== null) tokenDecimals.set(pool.tokenY, pool.tokenYDecimals);
    }
    const missingTokens = [
      ...new Set(
        logs
          .flatMap(log => [log.args.key.token0.toLowerCase(), log.args.key.token1.toLowerCase()])
          .filter(token => !tokenDecimals.has(token))
      ),
    ];
    await Promise.all(
      missingTokens.map(async token => {
        const decimals = await client
          .readContract({
            address: token as Address,
            abi: erc20DecimalsAbi,
            functionName: 'decimals',
            blockNumber: endBlock,
          })
          .catch(() => null);
        if (decimals === null) return;
        if (decimals > 36) throw new Error('TOKEN_DECIMALS_OUT_OF_RANGE');
        tokenDecimals.set(token, decimals);
      })
    );
    const [poolEvents, positionEvents, positionShareEvents] = await Promise.all([
      collectPoolEvents(client, [...descriptorByAddress.values()], nextBlock, endBlock),
      collectPositionEvents(client, deployment.positionManagerV2, nextBlock, endBlock),
      collectPositionShareEvents(client, deployment.positionManagerV2, nextBlock, endBlock),
    ]);
    const calloutUpdateTypes = classifyCalloutUpdates(positionEvents);

    const feeBinIds = [...new Set(poolEvents.binFees.map(fee => fee.binId))];
    const sharePositionIds = [...new Set(positionShareEvents.map(event => event.positionId))];
    const [initialPositionBins, existingPositionPools] = await Promise.all([
      feeBinIds.length === 0
        ? []
        : prisma.positionBin.findMany({
            where: {
              chainId: chain.chainId,
              binId: { in: feeBinIds },
              position: { canonical: true },
            },
            select: { poolId: true, positionId: true, binId: true, shares: true },
          }),
      sharePositionIds.length === 0
        ? []
        : prisma.position.findMany({
            where: { chainId: chain.chainId, id: { in: sharePositionIds } },
            select: { id: true, poolId: true },
          }),
    ]);

    // All derived rows and the cursor commit together; branching here preserves that boundary.
    // eslint-disable-next-line complexity
    await prisma.$transaction(
      async transaction => {
        const poolIdByAddress = new Map(
          existingPools.map(pool => [pool.address.toLowerCase(), pool.id])
        );
        const poolIdByPosition = new Map(
          existingPositionPools.map(position => [position.id, position.poolId])
        );
        const storedFeeAccruals: FeeAccrualEvent[] = [];
        for (const log of logs) {
          const blockNumber = requireMinedValue(log.blockNumber, 'BLOCK_NUMBER');
          const { key, pool } = log.args;
          const quoteToken = configuredQuoteToken(
            key.token0,
            key.token1,
            environment.QUOTE_TOKEN_ADDRESS
          );
          const storedPool = await transaction.pool.upsert({
            where: {
              chainId_address: { chainId: chain.chainId, address: pool.toLowerCase() },
            },
            create: {
              chainId: chain.chainId,
              address: pool.toLowerCase(),
              type: Number(key.model) === 0 ? 'DAMM' : 'DLMM',
              tokenX: key.token0.toLowerCase(),
              tokenY: key.token1.toLowerCase(),
              tokenXDecimals: tokenDecimals.get(key.token0.toLowerCase()) ?? null,
              tokenYDecimals: tokenDecimals.get(key.token1.toLowerCase()) ?? null,
              quoteToken,
              binStep: Number(key.binStepBps),
              baseFeePips: Number(key.feePips),
              initialActiveBin: activeBinByAddress.get(pool.toLowerCase()) ?? null,
              activeBin: activeBinByAddress.get(pool.toLowerCase()) ?? null,
              createdBlock: blockNumber,
            },
            update: {
              quoteToken,
              tokenXDecimals: tokenDecimals.get(key.token0.toLowerCase()) ?? null,
              tokenYDecimals: tokenDecimals.get(key.token1.toLowerCase()) ?? null,
              binStep: Number(key.binStepBps),
              baseFeePips: Number(key.feePips),
              activeBin: activeBinByAddress.get(pool.toLowerCase()) ?? null,
              canonical: true,
            },
          });
          poolIdByAddress.set(storedPool.address.toLowerCase(), storedPool.id);
        }
        for (const pool of existingPools) {
          const tokenXDecimals =
            tokenDecimals.get(pool.tokenX.toLowerCase()) ?? pool.tokenXDecimals;
          const tokenYDecimals =
            tokenDecimals.get(pool.tokenY.toLowerCase()) ?? pool.tokenYDecimals;
          if (tokenXDecimals === pool.tokenXDecimals && tokenYDecimals === pool.tokenYDecimals)
            continue;
          await transaction.pool.update({
            where: { id: pool.id },
            data: {
              tokenXDecimals,
              tokenYDecimals,
            },
          });
        }

        for (const bin of poolEvents.bins) {
          const poolId = poolIdByAddress.get(bin.poolAddress.toLowerCase());
          if (!poolId) throw new Error('POOL_ID_MISSING');
          await transaction.bin.upsert({
            where: { poolId_binId: { poolId, binId: bin.binId } },
            create: {
              poolId,
              binId: bin.binId,
              reserveX: bin.reserveX,
              reserveY: bin.reserveY,
              totalShares: bin.totalShares,
              updatedBlock: bin.blockNumber,
            },
            update: {
              reserveX: bin.reserveX,
              reserveY: bin.reserveY,
              totalShares: bin.totalShares,
              updatedBlock: bin.blockNumber,
            },
          });
        }

        for (const swap of poolEvents.swaps) {
          const poolId = poolIdByAddress.get(swap.poolAddress.toLowerCase());
          if (!poolId) throw new Error('POOL_ID_MISSING');
          await transaction.swap.upsert({
            where: {
              chainId_transactionHash_logIndex: {
                chainId: chain.chainId,
                transactionHash: swap.transactionHash,
                logIndex: swap.logIndex,
              },
            },
            create: {
              chainId: chain.chainId,
              poolId,
              transactionHash: swap.transactionHash,
              logIndex: swap.logIndex,
              transactionIndex: swap.transactionIndex,
              blockNumber: swap.blockNumber,
              blockHash: swap.blockHash,
              timestamp: swap.timestamp,
              sender: swap.sender.toLowerCase(),
              recipient: swap.recipient.toLowerCase(),
              tokenIn: swap.tokenIn.toLowerCase(),
              amountIn: swap.amountIn,
              amountOut: swap.amountOut,
              totalFee: swap.totalFee,
              protocolFee: swap.protocolFee,
              activeBinBefore: swap.activeBinBefore,
              activeBinAfter: swap.activeBinAfter,
              binCrossings: swap.binCrossings,
              reserveXAfter: swap.reserveXAfter,
              reserveYAfter: swap.reserveYAfter,
            },
            update: {
              blockHash: swap.blockHash,
              timestamp: swap.timestamp,
              transactionIndex: swap.transactionIndex,
              canonical: true,
              reserveXAfter: swap.reserveXAfter,
              reserveYAfter: swap.reserveYAfter,
            },
          });
          if (swap.activeBinAfter !== null) {
            await transaction.pool.update({
              where: { id: poolId },
              data: { activeBin: swap.activeBinAfter },
            });
          }
          const dedupKey = `${chain.chainId}:${swap.transactionHash}:${swap.logIndex}:pool.swap`;
          await transaction.outboxEvent.upsert({
            where: { dedupKey },
            create: {
              dedupKey,
              topic: 'pool.swap',
              aggregateId: swap.poolAddress.toLowerCase(),
              chainId: chain.chainId,
              blockNumber: swap.blockNumber,
              payload: {
                chainId: chain.chainId,
                pool: swap.poolAddress.toLowerCase(),
                transactionHash: swap.transactionHash,
                logIndex: swap.logIndex,
                blockNumber: swap.blockNumber.toString(),
                timestamp: swap.timestamp.toISOString(),
                tokenIn: swap.tokenIn.toLowerCase(),
                amountIn: swap.amountIn.toString(),
                amountOut: swap.amountOut.toString(),
              },
            },
            update: { canonical: true },
          });
        }
        const swapTimestampsByPool = new Map<string, Date[]>();
        for (const swap of poolEvents.swaps) {
          const poolId = poolIdByAddress.get(swap.poolAddress.toLowerCase());
          if (!poolId) throw new Error('POOL_ID_MISSING');
          const timestamps = swapTimestampsByPool.get(poolId) ?? [];
          timestamps.push(swap.timestamp);
          swapTimestampsByPool.set(poolId, timestamps);
        }
        for (const [poolId, timestamps] of swapTimestampsByPool) {
          await rebuildTouchedCandles(transaction, poolId, timestamps);
        }

        for (const fee of poolEvents.binFees) {
          const poolId = poolIdByAddress.get(fee.poolAddress.toLowerCase());
          if (!poolId) throw new Error('POOL_ID_MISSING');
          const storedFee = await transaction.binFeeAccrual.upsert({
            where: {
              chainId_transactionHash_logIndex: {
                chainId: chain.chainId,
                transactionHash: fee.transactionHash,
                logIndex: fee.logIndex,
              },
            },
            create: {
              chainId: chain.chainId,
              poolId,
              transactionHash: fee.transactionHash,
              logIndex: fee.logIndex,
              transactionIndex: fee.transactionIndex,
              blockNumber: fee.blockNumber,
              blockHash: fee.blockHash,
              timestamp: fee.timestamp,
              binId: fee.binId,
              tokenIn: fee.tokenIn.toLowerCase(),
              lpFee: fee.lpFee,
              totalShares: fee.totalShares,
            },
            update: {
              blockHash: fee.blockHash,
              timestamp: fee.timestamp,
              lpFee: fee.lpFee,
              totalShares: fee.totalShares,
              canonical: true,
            },
          });
          storedFeeAccruals.push({
            kind: 'fee',
            accrualId: storedFee.id,
            poolId,
            binId: fee.binId,
            lpFee: BigInt(fee.lpFee),
            totalShares: BigInt(fee.totalShares),
            timestamp: fee.timestamp,
            tokenIn: fee.tokenIn.toLowerCase(),
            blockNumber: fee.blockNumber,
            transactionIndex: fee.transactionIndex,
            logIndex: fee.logIndex,
          });
        }

        for (const event of positionEvents) {
          const poolId = poolIdByAddress.get(event.state.pool.toLowerCase());
          if (!poolId) throw new Error('POSITION_POOL_ID_MISSING');
          const current = await transaction.position.findUnique({
            where: { chainId_id: { chainId: chain.chainId, id: event.positionId } },
          });
          const owner = event.owner?.toLowerCase() ?? current?.owner;
          if (!owner) throw new Error('POSITION_OWNER_MISSING');
          await transaction.position.upsert({
            where: { chainId_id: { chainId: chain.chainId, id: event.positionId } },
            create: {
              id: event.positionId,
              chainId: chain.chainId,
              poolId,
              owner,
              lowerBin: event.state.lowerBin,
              upperBin: event.state.upperBin,
              shape: event.state.shape,
              tag: event.state.tag,
              referrer: event.state.referrer.toLowerCase(),
              status: projectedPositionStatus(event.kind),
              openedAt: event.timestamp,
              closedAt: event.kind === 'closed' ? event.timestamp : null,
              valueQuote: event.kind === 'closed' ? '0' : null,
              valueQuoteUpdatedAt: event.kind === 'closed' ? event.timestamp : null,
              valueQuoteBlock: event.kind === 'closed' ? event.blockNumber : null,
              canonical: true,
            },
            update: {
              poolId,
              owner,
              lowerBin: event.state.lowerBin,
              upperBin: event.state.upperBin,
              shape: event.state.shape,
              tag: event.state.tag,
              referrer: event.state.referrer.toLowerCase(),
              status: projectedPositionStatus(event.kind),
              closedAt: event.kind === 'closed' ? event.timestamp : null,
              ...(event.kind === 'closed'
                ? {
                    valueQuote: '0',
                    valueQuoteUpdatedAt: event.timestamp,
                    valueQuoteBlock: event.blockNumber,
                  }
                : {}),
              canonical: true,
            },
          });
          poolIdByPosition.set(event.positionId, poolId);
          await transaction.positionBin.deleteMany({
            where: { chainId: chain.chainId, positionId: event.positionId },
          });
          if (event.state.bins.length > 0) {
            await transaction.positionBin.createMany({
              data: event.state.bins.map(bin => ({
                chainId: chain.chainId,
                positionId: event.positionId,
                poolId,
                binId: bin.binId,
                shares: bin.shares,
              })),
            });
          }
          const storedEvent = await transaction.positionEvent.upsert({
            where: {
              chainId_transactionHash_logIndex: {
                chainId: chain.chainId,
                transactionHash: event.transactionHash,
                logIndex: event.logIndex,
              },
            },
            create: {
              chainId: chain.chainId,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              positionId: event.positionId,
              blockNumber: event.blockNumber,
              blockHash: event.blockHash,
              timestamp: event.timestamp,
              eventType: event.kind,
              owner,
              payload: event.payload,
            },
            update: {
              blockHash: event.blockHash,
              timestamp: event.timestamp,
              owner,
              payload: event.payload,
              canonical: true,
            },
          });
          const eventDedupKey = `${chain.chainId}:${event.transactionHash}:${event.logIndex}:position.${event.kind}`;
          await transaction.outboxEvent.upsert({
            where: { dedupKey: eventDedupKey },
            create: {
              dedupKey: eventDedupKey,
              topic: `position.${event.kind}`,
              aggregateId: `${chain.chainId}:${event.positionId}`,
              chainId: chain.chainId,
              blockNumber: event.blockNumber,
              payload: {
                chainId: chain.chainId,
                positionId: event.positionId.toString(),
                owner,
                pool: event.state.pool.toLowerCase(),
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber.toString(),
              },
            },
            update: { canonical: true },
          });

          if (event.kind === 'created') {
            const intent = await resolveCalloutIntent(transaction, {
              chainId: chain.chainId,
              poolId,
              tag: event.state.tag,
              owner,
              eventTimestamp: event.timestamp,
            });
            if (intent) {
              const consumed = await transaction.calloutIntent.updateMany({
                where: { id: intent.id, consumedAt: null },
                data: { consumedAt: event.timestamp },
              });
              if (consumed.count === 1) {
                const callout = await transaction.callout.upsert({
                  where: {
                    chainId_positionId: {
                      chainId: chain.chainId,
                      positionId: event.positionId,
                    },
                  },
                  create: {
                    userId: intent.userId,
                    chainId: chain.chainId,
                    positionId: event.positionId,
                    poolId,
                    caption: intent.caption,
                    showSize: intent.showSize,
                    side:
                      event.state.activeBin === null
                        ? null
                        : classifyRangeSide(
                            event.state.lowerBin,
                            event.state.upperBin,
                            event.state.activeBin
                          ),
                    shape: event.state.shape,
                    lowerBin: event.state.lowerBin,
                    upperBin: event.state.upperBin,
                    status: 'live',
                    createdAt: event.timestamp,
                  },
                  update: {
                    userId: intent.userId,
                    poolId,
                    caption: intent.caption,
                    showSize: intent.showSize,
                    side:
                      event.state.activeBin === null
                        ? null
                        : classifyRangeSide(
                            event.state.lowerBin,
                            event.state.upperBin,
                            event.state.activeBin
                          ),
                    shape: event.state.shape,
                    lowerBin: event.state.lowerBin,
                    upperBin: event.state.upperBin,
                    status: 'live',
                    createdAt: event.timestamp,
                    canonical: true,
                  },
                });
                const calloutDedupKey = `${chain.chainId}:${event.transactionHash}:${event.logIndex}:callout.new`;
                await transaction.outboxEvent.upsert({
                  where: { dedupKey: calloutDedupKey },
                  create: {
                    dedupKey: calloutDedupKey,
                    topic: 'callout.new',
                    aggregateId: callout.id,
                    chainId: chain.chainId,
                    blockNumber: event.blockNumber,
                    payload: {
                      id: callout.id,
                      chainId: chain.chainId,
                      positionId: event.positionId.toString(),
                      pool: event.state.pool.toLowerCase(),
                    },
                  },
                  update: { canonical: true },
                });
              }
            }

            const tailLink = await resolveTailIntent(transaction, {
              chainId: chain.chainId,
              poolId,
              tag: event.state.tag,
              owner,
              eventTimestamp: event.timestamp,
              referrer: event.state.referrer,
            });
            if (tailLink) {
              const consumed = await transaction.calloutIntent.updateMany({
                where: { id: tailLink.intent.id, consumedAt: null },
                data: { consumedAt: event.timestamp },
              });
              if (consumed.count === 1) {
                await transaction.tail.upsert({
                  where: {
                    chainId_positionId: { chainId: chain.chainId, positionId: event.positionId },
                  },
                  create: {
                    calloutId: tailLink.sourceCallout.id,
                    chainId: chain.chainId,
                    positionId: event.positionId,
                    tailerUserId: tailLink.intent.userId,
                    tailerWallet: owner,
                    mode: tailLink.intent.mode ?? 'same_range',
                    createdAt: event.timestamp,
                  },
                  update: {
                    calloutId: tailLink.sourceCallout.id,
                    tailerUserId: tailLink.intent.userId,
                    tailerWallet: owner,
                    mode: tailLink.intent.mode ?? 'same_range',
                    createdAt: event.timestamp,
                  },
                });
                const [likes, reposts, replies, tails] = await Promise.all([
                  transaction.like.count({ where: { calloutId: tailLink.sourceCallout.id } }),
                  transaction.repost.count({ where: { calloutId: tailLink.sourceCallout.id } }),
                  transaction.reply.count({
                    where: { calloutId: tailLink.sourceCallout.id, hidden: false },
                  }),
                  transaction.tail.count({ where: { calloutId: tailLink.sourceCallout.id } }),
                ]);
                const tailDedupKey = `${chain.chainId}:${event.transactionHash}:${event.logIndex}:callout.stats.tail`;
                await transaction.outboxEvent.upsert({
                  where: { dedupKey: tailDedupKey },
                  create: {
                    dedupKey: tailDedupKey,
                    topic: 'callout.stats',
                    aggregateId: tailLink.sourceCallout.id,
                    chainId: chain.chainId,
                    blockNumber: event.blockNumber,
                    payload: { id: tailLink.sourceCallout.id, likes, reposts, replies, tails },
                  },
                  update: { canonical: true },
                });
              }
            }
          }

          const calloutUpdateType = calloutUpdateTypes.get(calloutUpdateEventKey(event));
          if (calloutUpdateType) {
            await persistCalloutUpdate(transaction, {
              chainId: chain.chainId,
              positionId: event.positionId,
              positionEventId: storedEvent.id,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              blockNumber: event.blockNumber,
              type: calloutUpdateType,
            });
          }
        }

        const shareChanges: PositionShareChange[] = [];
        for (const event of positionShareEvents) {
          const poolId = poolIdByPosition.get(event.positionId);
          if (!poolId) throw new Error('POSITION_SHARE_POOL_ID_MISSING');
          shareChanges.push({
            kind: 'shares',
            poolId,
            positionId: event.positionId,
            bins: event.bins,
            shares: event.shares.map(value => BigInt(value)),
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex,
            logIndex: event.logIndex,
          });
          for (let index = 0; index < event.bins.length; index += 1) {
            const binId = event.bins[index];
            const shares = event.shares[index];
            if (binId === undefined || shares === undefined)
              throw new Error('INVALID_POSITION_SHARES_EVENT');
            await transaction.positionShareCheckpoint.upsert({
              where: {
                chainId_transactionHash_logIndex_binId: {
                  chainId: chain.chainId,
                  transactionHash: event.transactionHash,
                  logIndex: event.logIndex,
                  binId,
                },
              },
              create: {
                chainId: chain.chainId,
                positionId: event.positionId,
                poolId,
                transactionHash: event.transactionHash,
                transactionIndex: event.transactionIndex,
                logIndex: event.logIndex,
                blockNumber: event.blockNumber,
                blockHash: event.blockHash,
                timestamp: event.timestamp,
                binId,
                shares,
              },
              update: {
                blockHash: event.blockHash,
                timestamp: event.timestamp,
                shares,
                canonical: true,
              },
            });
          }
        }

        const feeCredits = projectPositionFeeCredits(
          initialPositionBins.map(row => ({
            poolId: row.poolId,
            positionId: row.positionId,
            binId: row.binId,
            shares: BigInt(row.shares.toString()),
          })),
          shareChanges,
          storedFeeAccruals
        );
        const accountingPools = await transaction.pool.findMany({
          where: { id: { in: [...new Set(feeCredits.map(credit => credit.poolId))] } },
          select: {
            id: true,
            tokenX: true,
            tokenY: true,
            tokenXDecimals: true,
            tokenYDecimals: true,
            quoteToken: true,
            binStep: true,
          },
        });
        const accountingPoolById = new Map(accountingPools.map(pool => [pool.id, pool]));
        const creditedPositions = new Set<bigint>();
        for (const credit of feeCredits) {
          const accountingPool = accountingPoolById.get(credit.poolId);
          if (!accountingPool) throw new Error('FEE_ACCOUNTING_POOL_MISSING');
          const amountQuote = quoteAmountForCredit(
            credit.amountRaw,
            credit.tokenIn,
            credit.binId,
            accountingPool
          );
          await transaction.positionFeeCredit.upsert({
            where: {
              accrualId_chainId_positionId: {
                accrualId: credit.accrualId,
                chainId: chain.chainId,
                positionId: credit.positionId,
              },
            },
            create: {
              accrualId: credit.accrualId,
              chainId: chain.chainId,
              positionId: credit.positionId,
              poolId: credit.poolId,
              timestamp: credit.timestamp,
              tokenIn: credit.tokenIn,
              amountRaw: credit.amountRaw.toString(),
              amountQuote,
            },
            update: {
              amountRaw: credit.amountRaw.toString(),
              amountQuote,
              canonical: true,
            },
          });
          creditedPositions.add(credit.positionId);
        }
        for (const positionId of creditedPositions) {
          const aggregate = await transaction.positionFeeCredit.aggregate({
            where: { chainId: chain.chainId, positionId, canonical: true },
            _sum: { amountQuote: true },
          });
          await transaction.position.update({
            where: { chainId_id: { chainId: chain.chainId, id: positionId } },
            data: { earnedQuote: aggregate._sum.amountQuote?.toString() ?? '0' },
          });
        }

        const clockPositions = await transaction.position.findMany({
          where: { chainId: chain.chainId, canonical: true },
          select: {
            id: true,
            poolId: true,
            lowerBin: true,
            upperBin: true,
            openedAt: true,
            closedAt: true,
            pool: { select: { type: true, initialActiveBin: true } },
          },
        });
        const clockPoolIds = [...new Set(clockPositions.map(position => position.poolId))];
        const clockSwaps =
          clockPoolIds.length === 0
            ? []
            : await transaction.swap.findMany({
                where: {
                  chainId: chain.chainId,
                  poolId: { in: clockPoolIds },
                  canonical: true,
                  timestamp: { lte: new Date(Number(end.timestamp) * 1_000) },
                },
                select: {
                  poolId: true,
                  timestamp: true,
                  activeBinBefore: true,
                  activeBinAfter: true,
                  blockNumber: true,
                  transactionIndex: true,
                  logIndex: true,
                },
                orderBy: [{ blockNumber: 'asc' }, { transactionIndex: 'asc' }, { logIndex: 'asc' }],
              });
        const clockSwapsByPool = new Map<string, RangeClockSwap[]>();
        for (const swap of clockSwaps) {
          if (swap.activeBinBefore === null || swap.activeBinAfter === null) continue;
          const rows = clockSwapsByPool.get(swap.poolId) ?? [];
          rows.push({
            timestamp: swap.timestamp,
            activeBinBefore: swap.activeBinBefore,
            activeBinAfter: swap.activeBinAfter,
            blockNumber: swap.blockNumber,
            transactionIndex: swap.transactionIndex,
            logIndex: swap.logIndex,
          });
          clockSwapsByPool.set(swap.poolId, rows);
        }
        const measuredAt = new Date(Number(end.timestamp) * 1_000);
        for (const position of clockPositions) {
          const clock =
            position.pool.type === 'DAMM'
              ? calculateAlwaysInRangeClock(position.openedAt, position.closedAt, measuredAt)
              : calculateRangeClock(
                  position,
                  requireInitialActiveBin(position.pool.initialActiveBin),
                  clockSwapsByPool.get(position.poolId) ?? [],
                  measuredAt
                );
          await transaction.position.update({
            where: { chainId_id: { chainId: chain.chainId, id: position.id } },
            data: { inRangeSeconds: clock.inRangeSeconds, openSeconds: clock.openSeconds },
          });
        }

        await transaction.canonicalBlock.upsert({
          where: {
            chainId_blockNumber: { chainId: chain.chainId, blockNumber: endBlock },
          },
          create: {
            chainId: chain.chainId,
            blockNumber: endBlock,
            hash: end.hash,
            parentHash: end.parentHash,
            timestamp: new Date(Number(end.timestamp) * 1_000),
          },
          update: {
            hash: end.hash,
            parentHash: end.parentHash,
            timestamp: new Date(Number(end.timestamp) * 1_000),
            canonical: true,
          },
        });
        await transaction.chainCursor.update({
          where: { chainId: chain.chainId },
          data: {
            nextBlock: endBlock + 1n,
            lastProcessedBlock: endBlock,
            lastProcessedHash: end.hash,
          },
        });
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    poolsDiscovered += logs.length;
    binsProjected += poolEvents.bins.length;
    binFeesProjected += poolEvents.binFees.length;
    swapsProjected += poolEvents.swaps.length;
    positionEventsProjected += positionEvents.length;
    batches += 1;
    nextBlock = endBlock + 1n;
  }

  return {
    batches,
    poolsDiscovered,
    binsProjected,
    binFeesProjected,
    swapsProjected,
    positionEventsProjected,
    fromBlock: firstBlock,
    toBlock: nextBlock > firstBlock ? nextBlock - 1n : firstBlock - 1n,
  };
}
