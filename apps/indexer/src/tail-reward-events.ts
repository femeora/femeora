import { feeSplitterAbi } from '@fomeora/contracts-sdk';
import type { Address, Hex } from 'viem';

import type { IndexerClient } from './chain-client.js';

export interface TailRewardProjection {
  transactionHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: Date;
  token: Address;
  referrer: Address;
  referrerPositionId: bigint;
  treasuryAmount: bigint;
  rewardAmount: bigint;
  eligible: boolean;
}

export async function collectTailRewardEvents(
  client: IndexerClient,
  feeSplitter: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<TailRewardProjection[]> {
  const logs = await client.getContractEvents({
    address: feeSplitter,
    abi: feeSplitterAbi,
    eventName: 'TailFeesDistributed',
    fromBlock,
    toBlock,
    strict: true,
  });
  const blockNumbers = [...new Set(logs.flatMap(log => log.blockNumber === null ? [] : [log.blockNumber]))];
  const timestamps = new Map<bigint, Date>();
  await Promise.all(blockNumbers.map(async blockNumber => {
    const block = await client.getBlock({ blockNumber });
    timestamps.set(blockNumber, new Date(Number(block.timestamp) * 1_000));
  }));
  return logs.map(log => {
    if (log.transactionHash === null || log.logIndex === null || log.blockNumber === null) {
      throw new Error('UNMINED_TAIL_REWARD_EVENT');
    }
    const timestamp = timestamps.get(log.blockNumber);
    if (!timestamp) throw new Error('TAIL_REWARD_TIMESTAMP_MISSING');
    return {
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      timestamp,
      token: log.args.token,
      referrer: log.args.referrer,
      referrerPositionId: log.args.referrerPositionId,
      treasuryAmount: log.args.treasuryAmount,
      rewardAmount: log.args.tailReward,
      eligible: log.args.eligible,
    };
  });
}
