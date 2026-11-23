import { createPublicClient, fallback, http, type PublicClient } from 'viem';

export function createApiChainClient(environment: { RPC_URL: string; RPC_FALLBACK_URL?: string }): PublicClient {
  const transports = [http(environment.RPC_URL, { retryCount: 1 })];
  if (environment.RPC_FALLBACK_URL) {
    transports.push(http(environment.RPC_FALLBACK_URL, { retryCount: 1 }));
  }
  return createPublicClient({ transport: fallback(transports) });
}

export type ApiChainClient = PublicClient;
