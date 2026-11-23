import { dammPoolAbi, dlmmPoolV2Abi } from '@fomeora/contracts-sdk';
import type { Address, Hex } from 'viem';

import type { IndexerClient } from './chain-client.js';

export interface PoolDescriptor {
  readonly address: Address;
  readonly type: 'DAMM' | 'DLMM';
  readonly tokenX: Address;
  readonly tokenY: Address;
}

export interface BinProjection {
  readonly poolAddress: Address;
  readonly binId: number;
  readonly reserveX: string;
  readonly reserveY: string;
  readonly totalShares: string;
  readonly blockNumber: bigint;
}

export interface SwapProjection {
  readonly poolAddress: Address;
  readonly transactionHash: Hex;
  readonly logIndex: number;
  readonly transactionIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly timestamp: Date;
  readonly sender: Address;
  readonly recipient: Address;
  readonly tokenIn: Address;
  readonly amountIn: string;
  readonly amountOut: string;
  readonly totalFee: string | null;
  readonly protocolFee: string;
  readonly activeBinBefore: number | null;
  readonly activeBinAfter: number | null;
  readonly binCrossings: number | null;
}

export interface BinFeeProjection {
  readonly poolAddress: Address;
  readonly transactionHash: Hex;
  readonly logIndex: number;
  readonly transactionIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly timestamp: Date;
  readonly binId: number;
  readonly tokenIn: Address;
  readonly lpFee: string;
  readonly totalShares: string;
}

export interface PoolEventBatch {
  readonly bins: readonly BinProjection[];
  readonly binFees: readonly BinFeeProjection[];
  readonly swaps: readonly SwapProjection[];
}

function mined<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) throw new Error(`UNMINED_LOG_${field}`);
  return value;
}

// Keep all untrusted RPC event-shape validation at this single decoding boundary.
// eslint-disable-next-line complexity
export async function collectPoolEvents(
  client: IndexerClient,
  pools: readonly PoolDescriptor[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<PoolEventBatch> {
  const dlmmAddresses = pools.filter(pool => pool.type === 'DLMM').map(pool => pool.address);
  const dammAddresses = pools.filter(pool => pool.type === 'DAMM').map(pool => pool.address);
  const descriptorByAddress = new Map(pools.map(pool => [pool.address.toLowerCase(), pool]));

  const [binLogs, binFeeLogs, dlmmSwapLogs, dammSwapLogs] = await Promise.all([
    dlmmAddresses.length === 0
      ? []
      : client.getContractEvents({
          address: dlmmAddresses,
          abi: dlmmPoolV2Abi,
          eventName: 'BinsUpdated',
          fromBlock,
          toBlock,
          strict: true,
        }),
    dlmmAddresses.length === 0
      ? []
      : client.getContractEvents({
          address: dlmmAddresses,
          abi: dlmmPoolV2Abi,
          eventName: 'BinFeeAccrued',
          fromBlock,
          toBlock,
          strict: true,
        }),
    dlmmAddresses.length === 0
      ? []
      : client.getContractEvents({
          address: dlmmAddresses,
          abi: dlmmPoolV2Abi,
          eventName: 'Swap',
          fromBlock,
          toBlock,
          strict: true,
        }),
    dammAddresses.length === 0
      ? []
      : client.getContractEvents({
          address: dammAddresses,
          abi: dammPoolAbi,
          eventName: 'Swap',
          fromBlock,
          toBlock,
          strict: true,
        }),
  ]);

  const binStates = new Map<string, bigint>();
  await Promise.all(
    binLogs.flatMap(log => {
      const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
      return log.args.ids.map(async binId => {
        const key = `${log.address.toLowerCase()}:${binId}:${blockNumber}`;
        if (binStates.has(key)) return;
        const state = await client.readContract({
          address: log.address,
          abi: dlmmPoolV2Abi,
          functionName: 'binState',
          args: [binId],
          blockNumber,
        });
        binStates.set(key, state[2]);
      });
    }),
  );

  const bins: BinProjection[] = [];
  for (const log of binLogs) {
    const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
    if (
      log.args.ids.length !== log.args.reserves0.length ||
      log.args.ids.length !== log.args.reserves1.length
    ) {
      throw new Error('INVALID_BINS_UPDATED_EVENT');
    }
    for (let index = 0; index < log.args.ids.length; index += 1) {
      const binId = log.args.ids[index];
      const reserveX = log.args.reserves0[index];
      const reserveY = log.args.reserves1[index];
      if (binId === undefined || reserveX === undefined || reserveY === undefined) {
        throw new Error('INVALID_BINS_UPDATED_EVENT');
      }
      const stateKey = `${log.address.toLowerCase()}:${binId}:${blockNumber}`;
      const totalShares = binStates.get(stateKey);
      if (totalShares === undefined) throw new Error('BIN_STATE_MISSING');
      bins.push({
        poolAddress: log.address,
        binId,
        reserveX: reserveX.toString(),
        reserveY: reserveY.toString(),
        totalShares: totalShares.toString(),
        blockNumber,
      });
    }
  }

  const swapBlocks = new Set<bigint>();
  for (const log of [...binFeeLogs, ...dlmmSwapLogs, ...dammSwapLogs]) {
    swapBlocks.add(mined(log.blockNumber, 'BLOCK_NUMBER'));
  }
  const timestampByBlock = new Map<bigint, Date>();
  await Promise.all(
    [...swapBlocks].map(async blockNumber => {
      const block = await client.getBlock({ blockNumber });
      timestampByBlock.set(blockNumber, new Date(Number(block.timestamp) * 1_000));
    }),
  );

  const binFees: BinFeeProjection[] = [];
  for (const log of binFeeLogs) {
    const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
    const descriptor = descriptorByAddress.get(log.address.toLowerCase());
    const timestamp = timestampByBlock.get(blockNumber);
    if (!descriptor || !timestamp) throw new Error('POOL_DESCRIPTOR_MISSING');
    binFees.push({
      poolAddress: log.address,
      transactionHash: mined(log.transactionHash, 'TRANSACTION_HASH'),
      logIndex: mined(log.logIndex, 'LOG_INDEX'),
      transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'),
      blockNumber,
      blockHash: mined(log.blockHash, 'BLOCK_HASH'),
      timestamp,
      binId: log.args.binId,
      tokenIn: log.args.token0ToToken1 ? descriptor.tokenX : descriptor.tokenY,
      lpFee: log.args.lpFee.toString(),
      totalShares: log.args.totalShares.toString(),
    });
  }

  const swaps: SwapProjection[] = [];
  for (const log of dlmmSwapLogs) {
    const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
    const descriptor = descriptorByAddress.get(log.address.toLowerCase());
    const timestamp = timestampByBlock.get(blockNumber);
    if (!descriptor || !timestamp) throw new Error('POOL_DESCRIPTOR_MISSING');
    swaps.push({
      poolAddress: log.address,
      transactionHash: mined(log.transactionHash, 'TRANSACTION_HASH'),
      logIndex: mined(log.logIndex, 'LOG_INDEX'),
      transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'),
      blockNumber,
      blockHash: mined(log.blockHash, 'BLOCK_HASH'),
      timestamp,
      sender: log.args.sender,
      recipient: log.args.recipient,
      tokenIn: log.args.token0ToToken1 ? descriptor.tokenX : descriptor.tokenY,
      amountIn: log.args.amountIn.toString(),
      amountOut: log.args.amountOut.toString(),
      totalFee: log.args.totalFee.toString(),
      protocolFee: log.args.protocolFee.toString(),
      activeBinBefore: log.args.activeBinBefore,
      activeBinAfter: log.args.activeBinAfter,
      binCrossings: log.args.binsCrossed,
    });
  }
  for (const log of dammSwapLogs) {
    const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
    const timestamp = timestampByBlock.get(blockNumber);
    if (!timestamp) throw new Error('BLOCK_TIMESTAMP_MISSING');
    swaps.push({
      poolAddress: log.address,
      transactionHash: mined(log.transactionHash, 'TRANSACTION_HASH'),
      logIndex: mined(log.logIndex, 'LOG_INDEX'),
      transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'),
      blockNumber,
      blockHash: mined(log.blockHash, 'BLOCK_HASH'),
      timestamp,
      sender: log.args.sender,
      recipient: log.args.recipient,
      tokenIn: log.args.tokenIn,
      amountIn: log.args.amountIn.toString(),
      amountOut: log.args.amountOut.toString(),
      totalFee: null,
      protocolFee: log.args.protocolFee.toString(),
      activeBinBefore: null,
      activeBinAfter: null,
      binCrossings: null,
    });
  }

  return { bins, binFees, swaps };
}
