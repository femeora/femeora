import {
  getFomeoraDeployment,
  getFomeoraDeploymentStartBlock,
} from '@fomeora/contracts-sdk';
import type { IndexerEnvironment } from '@fomeora/env';
import { createPublicClient, http } from 'viem';
import type { PublicClient } from 'viem';

export type IndexerClient = PublicClient;

export function createIndexerClient(environment: IndexerEnvironment): IndexerClient {
  return createPublicClient({ transport: http(environment.RPC_INDEXER, { retryCount: 2 }) });
}

export interface IndexerChainState {
  readonly chainId: number;
  readonly deploymentStartBlock: bigint;
  readonly latestBlock: bigint;
  readonly safeBlock: bigint;
}

export async function verifyIndexerChain(
  client: IndexerClient,
  environment: IndexerEnvironment,
): Promise<IndexerChainState> {
  const deployment = getFomeoraDeployment(environment.CHAIN_ID);
  const deploymentStartBlock = getFomeoraDeploymentStartBlock(environment.CHAIN_ID);
  const [chainId, latestBlock, registryCode] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getBytecode({ address: deployment.poolRegistry }),
  ]);

  if (chainId !== environment.CHAIN_ID) throw new Error('CHAIN_ID_MISMATCH');
  if (!registryCode || registryCode === '0x') throw new Error('DEPLOYMENT_CODE_MISSING');

  const confirmations = BigInt(environment.INDEXER_CONFIRMATIONS);
  const safeBlock = latestBlock > confirmations ? latestBlock - confirmations : 0n;
  if (safeBlock < deploymentStartBlock) throw new Error('CHAIN_BEFORE_DEPLOYMENT');

  return { chainId, deploymentStartBlock, latestBlock, safeBlock };
}
