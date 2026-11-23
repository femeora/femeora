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
  readonly reserveXAfter: string | null;
  readonly reserveYAfter: string | null;
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
  const latestBlock = dammAddresses.length === 0 ? toBlock : await client.getBlockNumber();

  const [binLogs, binFeeLogs, dlmmSwapLogs, dammSwapLogs, dammAddedLogs, dammRemovedLogs] = await Promise.all([
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
          toBlock: latestBlock,
          strict: true,
        }),
    dammAddresses.length === 0
      ? []
      : client.getContractEvents({
          address: dammAddresses, abi: dammPoolAbi, eventName: 'LiquidityAdded', fromBlock, toBlock: latestBlock, strict: true,
        }),
    dammAddresses.length === 0
      ? []
      : client.getContractEvents({
          address: dammAddresses, abi: dammPoolAbi, eventName: 'LiquidityRemoved', fromBlock, toBlock: latestBlock, strict: true,
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
      reserveXAfter: null,
      reserveYAfter: null,
    });
  }
  const dammReserves = new Map<string, { x: bigint; y: bigint }>();
  await Promise.all(dammAddresses.map(async address => {
    const [x, y] = await Promise.all([
      client.readContract({ address, abi: dammPoolAbi, functionName: 'reserve0' }),
      client.readContract({ address, abi: dammPoolAbi, functionName: 'reserve1' }),
    ]);
    dammReserves.set(address.toLowerCase(), { x, y });
  }));
  const dammEvents = [
    ...dammAddedLogs.map(log => ({
      kind: 'add' as const, address: log.address, blockNumber: mined(log.blockNumber, 'BLOCK_NUMBER'),
      transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'), logIndex: mined(log.logIndex, 'LOG_INDEX'),
      amount0: log.args.amount0, amount1: log.args.amount1,
    })),
    ...dammRemovedLogs.map(log => ({
      kind: 'remove' as const, address: log.address, blockNumber: mined(log.blockNumber, 'BLOCK_NUMBER'),
      transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'), logIndex: mined(log.logIndex, 'LOG_INDEX'),
      amount0: log.args.amount0, amount1: log.args.amount1,
    })),
    ...dammSwapLogs.map(log => ({
      kind: 'swap' as const, address: log.address, blockNumber: mined(log.blockNumber, 'BLOCK_NUMBER'),
      blockHash: mined(log.blockHash, 'BLOCK_HASH'), transactionHash: mined(log.transactionHash, 'TRANSACTION_HASH'),
      transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'), logIndex: mined(log.logIndex, 'LOG_INDEX'),
      sender: log.args.sender, recipient: log.args.recipient, tokenIn: log.args.tokenIn,
      amountIn: log.args.amountIn, amountOut: log.args.amountOut, protocolFee: log.args.protocolFee,
    })),
  ].sort((left, right) => {
    const block = Number(left.blockNumber - right.blockNumber);
    if (block !== 0) return block;
    const transaction = left.transactionIndex - right.transactionIndex;
    return transaction !== 0 ? transaction : left.logIndex - right.logIndex;
  });
  const dammSwaps: SwapProjection[] = [];
  for (const event of [...dammEvents].reverse()) {
    const blockNumber = event.blockNumber;
    const timestamp = timestampByBlock.get(blockNumber);
    if (!timestamp) throw new Error('BLOCK_TIMESTAMP_MISSING');
    const descriptor = descriptorByAddress.get(event.address.toLowerCase());
    const reserves = dammReserves.get(event.address.toLowerCase());
    if (!descriptor || !reserves) throw new Error('POOL_DESCRIPTOR_MISSING');
    if (event.kind === 'add') {
      reserves.x -= event.amount0;
      reserves.y -= event.amount1;
      continue;
    }
    if (event.kind === 'remove') {
      reserves.x += event.amount0;
      reserves.y += event.amount1;
      continue;
    }
    if (event.blockNumber <= toBlock) {
      dammSwaps.push({
        poolAddress: event.address,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        transactionIndex: event.transactionIndex,
        blockNumber,
        blockHash: event.blockHash,
        timestamp,
        sender: event.sender,
        recipient: event.recipient,
        tokenIn: event.tokenIn,
        amountIn: event.amountIn.toString(),
        amountOut: event.amountOut.toString(),
        totalFee: null,
        protocolFee: event.protocolFee.toString(),
        activeBinBefore: null,
        activeBinAfter: null,
        binCrossings: null,
        reserveXAfter: reserves.x.toString(),
        reserveYAfter: reserves.y.toString(),
      });
    }
    if (event.tokenIn.toLowerCase() === descriptor.tokenX.toLowerCase()) {
      reserves.x -= event.amountIn - event.protocolFee;
      reserves.y += event.amountOut;
    } else {
      reserves.y -= event.amountIn - event.protocolFee;
      reserves.x += event.amountOut;
    }
  }
  swaps.push(...dammSwaps.reverse());

  return { bins, binFees, swaps };
}
