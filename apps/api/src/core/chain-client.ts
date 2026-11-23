import { createPublicClient, http, type PublicClient } from 'viem';

export function createApiChainClient(environment: { RPC_URL: string }): PublicClient {
  return createPublicClient({ transport: http(environment.RPC_URL, { retryCount: 2 }) });
}

export type ApiChainClient = PublicClient;
