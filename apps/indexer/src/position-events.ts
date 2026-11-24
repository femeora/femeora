import { dlmmPoolV2Abi, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import { decodeFunctionData, type Address, type Hex } from 'viem';

import type { IndexerClient } from './chain-client.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const supportedEvents = new Set([
  'RangePositionCreated',
  'DammPositionCreated',
  'RangePositionIncreased',
  'DammPositionIncreased',
  'RangePositionDecreased',
  'DammPositionDecreased',
  'RangePositionClosed',
  'DammPositionClosed',
  'Transfer',
]);

export interface PositionBinSnapshot {
  readonly binId: number;
  readonly shares: string;
}

export interface PositionStateSnapshot {
  readonly pool: Address;
  readonly lowerBin: number;
  readonly upperBin: number;
  readonly shape: number;
  readonly tag: Hex;
  readonly referrer: Address;
  readonly open: boolean;
  readonly activeBin: number | null;
  readonly bins: readonly PositionBinSnapshot[];
}

export interface PositionEventProjection {
  readonly kind: 'created' | 'increased' | 'decreased' | 'closed' | 'transferred';
  readonly positionId: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
  readonly transactionIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly timestamp: Date;
  readonly owner: Address | null;
  readonly state: PositionStateSnapshot;
  readonly payload: Record<string, string | number | boolean | readonly string[] | readonly number[]>;
}

export interface PositionShareProjection {
  readonly positionId: bigint;
  readonly transactionHash: Hex;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly timestamp: Date;
  readonly bins: readonly number[];
  readonly shares: readonly string[];
}

function mined<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) throw new Error(`UNMINED_POSITION_LOG_${field}`);
  return value;
}

function eventPositionId(log: { eventName?: string; args: unknown }): bigint | null {
  if (!log.eventName || !supportedEvents.has(log.eventName)) return null;
  if (log.eventName === 'Transfer') {
    const args = log.args as { from: Address; to: Address; tokenId: bigint };
    if (args.from.toLowerCase() === ZERO_ADDRESS || args.to.toLowerCase() === ZERO_ADDRESS) {
      return null;
    }
    return args.tokenId;
  }
  return (log.args as { id: bigint }).id;
}

function eventKind(eventName: string): PositionEventProjection['kind'] {
  if (eventName.endsWith('Created')) return 'created';
  if (eventName.endsWith('Increased')) return 'increased';
  if (eventName.endsWith('Decreased')) return 'decreased';
  if (eventName.endsWith('Closed')) return 'closed';
  return 'transferred';
}

function eventOwner(eventName: string, args: unknown): Address | null {
  if (eventName.endsWith('Created')) return (args as { owner: Address }).owner;
  if (eventName === 'Transfer') return (args as { to: Address }).to;
  return null;
}

function eventPayload(
  eventName: string,
  args: unknown,
  transactionInput?: { functionName: string; args: readonly unknown[] },
) {
  switch (eventName) {
    case 'RangePositionCreated': {
      const value = args as {
        pool: Address;
        lowerBin: number;
        upperBin: number;
        shape: number;
        tag: Hex;
        referrer: Address;
      };
      const create = transactionInput?.functionName === 'createRangePosition'
        ? transactionInput.args[0] as { bins: readonly number[]; amountsX: readonly bigint[]; amountsY: readonly bigint[] }
        : null;
      return {
        pool: value.pool.toLowerCase(),
        lowerBin: value.lowerBin,
        upperBin: value.upperBin,
        shape: value.shape,
        tag: value.tag,
        referrer: value.referrer.toLowerCase(),
        ...(create ? {
          bins: create.bins,
          amountsX: create.amountsX.map(amount => amount.toString()),
          amountsY: create.amountsY.map(amount => amount.toString()),
        } : {}),
      };
    }
    case 'DammPositionCreated': {
      const value = args as { pool: Address; shares: bigint; tag: Hex; referrer: Address };
      return {
        pool: value.pool.toLowerCase(),
        shares: value.shares.toString(),
        tag: value.tag,
        referrer: value.referrer.toLowerCase(),
      };
    }
    case 'RangePositionIncreased': {
      const value = args as {
        bins: readonly number[];
        amountsX: readonly bigint[];
        amountsY: readonly bigint[];
      };
      return {
        bins: value.bins,
        amountsX: value.amountsX.map(amount => amount.toString()),
        amountsY: value.amountsY.map(amount => amount.toString()),
      };
    }
    case 'DammPositionIncreased': {
      const value = args as { sharesAdded: bigint; totalShares: bigint };
      return { sharesAdded: value.sharesAdded.toString(), totalShares: value.totalShares.toString() };
    }
    case 'RangePositionDecreased':
    case 'DammPositionDecreased': {
      const value = args as { bps: number; amountX: bigint; amountY: bigint };
      return {
        bps: value.bps,
        amountX: value.amountX.toString(),
        amountY: value.amountY.toString(),
      };
    }
    case 'Transfer': {
      const value = args as { from: Address; to: Address };
      return { from: value.from.toLowerCase(), to: value.to.toLowerCase() };
    }
    default:
      return {};
  }
}

export async function collectPositionEvents(
  client: IndexerClient,
  positionManager: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<readonly PositionEventProjection[]> {
  const logs = await client.getContractEvents({
    address: positionManager,
    abi: positionManagerV2Abi,
    fromBlock,
    toBlock,
    strict: true,
  });
  const relevant = logs
    .map(log => ({ log, positionId: eventPositionId(log) }))
    .filter((item): item is typeof item & { positionId: bigint } => item.positionId !== null);

  const transactionInputByHash = new Map<Hex, { functionName: string; args: readonly unknown[] }>();
  const inputEvents = relevant.filter(({ log }) => log.eventName === 'RangePositionCreated');
  await Promise.all(
    [...new Set(inputEvents.map(({ log }) => mined(log.transactionHash, 'TRANSACTION_HASH')))].map(
      async transactionHash => {
        if (typeof client.getTransaction !== 'function') return;
        const transaction = await client.getTransaction({ hash: transactionHash }).catch(() => null);
        if (!transaction) return;
        const decoded = decodeFunctionData({ abi: positionManagerV2Abi, data: transaction.input });
        transactionInputByHash.set(transactionHash, {
          functionName: decoded.functionName,
          args: (decoded.args ?? []) as readonly unknown[],
        });
      },
    ),
  );

  const timestampByBlock = new Map<bigint, Date>();
  await Promise.all(
    [...new Set(relevant.map(item => mined(item.log.blockNumber, 'BLOCK_NUMBER')))].map(
      async blockNumber => {
        const block = await client.getBlock({ blockNumber });
        timestampByBlock.set(blockNumber, new Date(Number(block.timestamp) * 1_000));
      },
    ),
  );

  const stateByPositionBlock = new Map<string, PositionStateSnapshot>();
  await Promise.all(
    relevant.map(async ({ log, positionId }) => {
      const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
      const key = `${positionId}:${blockNumber}`;
      if (stateByPositionBlock.has(key)) return;
      const state = await client.readContract({
        address: positionManager,
        abi: positionManagerV2Abi,
        functionName: 'positions',
        args: [positionId],
        blockNumber,
      });
      const bins = await client.readContract({
        address: positionManager,
        abi: positionManagerV2Abi,
        functionName: 'positionBins',
        args: [positionId],
        blockNumber,
      });
      const binSnapshots = await Promise.all(
        bins.map(async binId => ({
          binId,
          shares: (
            await client.readContract({
              address: positionManager,
              abi: positionManagerV2Abi,
              functionName: 'binShares',
              args: [positionId, binId],
              blockNumber,
            })
          ).toString(),
        })),
      );
      const activeBin = bins.length > 0
        ? await client.readContract({
            address: state[0],
            abi: dlmmPoolV2Abi,
            functionName: 'activeBin',
            blockNumber,
          })
        : null;
      stateByPositionBlock.set(key, {
        pool: state[0],
        lowerBin: state[1],
        upperBin: state[2],
        shape: state[3],
        tag: state[4],
        referrer: state[5],
        open: state[6],
        activeBin,
        bins: binSnapshots,
      });
    }),
  );

  return relevant
    .map(({ log, positionId }) => {
      const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
      const state = stateByPositionBlock.get(`${positionId}:${blockNumber}`);
      const timestamp = timestampByBlock.get(blockNumber);
      if (!state || !timestamp || !log.eventName) throw new Error('POSITION_STATE_MISSING');
      return {
        kind: eventKind(log.eventName),
        positionId,
        transactionHash: mined(log.transactionHash, 'TRANSACTION_HASH'),
        logIndex: mined(log.logIndex, 'LOG_INDEX'),
        transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'),
        blockNumber,
        blockHash: mined(log.blockHash, 'BLOCK_HASH'),
        timestamp,
        owner: eventOwner(log.eventName, log.args),
        state,
        payload: eventPayload(
          log.eventName,
          log.args,
          transactionInputByHash.get(mined(log.transactionHash, 'TRANSACTION_HASH')),
        ),
      };
    })
    .sort((left, right) =>
      left.blockNumber === right.blockNumber
        ? left.transactionIndex === right.transactionIndex
          ? left.logIndex - right.logIndex
          : left.transactionIndex - right.transactionIndex
        : left.blockNumber < right.blockNumber
          ? -1
          : 1,
    );
}

export async function collectPositionShareEvents(
  client: IndexerClient,
  positionManager: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<readonly PositionShareProjection[]> {
  const logs = await client.getContractEvents({
    address: positionManager,
    abi: positionManagerV2Abi,
    eventName: 'PositionSharesUpdated',
    fromBlock,
    toBlock,
    strict: true,
  });
  const timestampByBlock = new Map<bigint, Date>();
  await Promise.all(
    [...new Set(logs.map(log => mined(log.blockNumber, 'BLOCK_NUMBER')))].map(async blockNumber => {
      const block = await client.getBlock({ blockNumber });
      timestampByBlock.set(blockNumber, new Date(Number(block.timestamp) * 1_000));
    }),
  );
  return logs
    .map(log => {
      const blockNumber = mined(log.blockNumber, 'BLOCK_NUMBER');
      const timestamp = timestampByBlock.get(blockNumber);
      if (!timestamp || log.args.bins.length !== log.args.shares.length) {
        throw new Error('INVALID_POSITION_SHARES_EVENT');
      }
      return {
        positionId: log.args.id,
        transactionHash: mined(log.transactionHash, 'TRANSACTION_HASH'),
        transactionIndex: mined(log.transactionIndex, 'TRANSACTION_INDEX'),
        logIndex: mined(log.logIndex, 'LOG_INDEX'),
        blockNumber,
        blockHash: mined(log.blockHash, 'BLOCK_HASH'),
        timestamp,
        bins: log.args.bins,
        shares: log.args.shares.map(value => value.toString()),
      };
    })
    .sort((left, right) =>
      left.blockNumber === right.blockNumber
        ? left.transactionIndex === right.transactionIndex
          ? left.logIndex - right.logIndex
          : left.transactionIndex - right.transactionIndex
        : left.blockNumber < right.blockNumber
          ? -1
          : 1,
    );
}
