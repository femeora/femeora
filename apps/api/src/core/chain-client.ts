import { createPublicClient, fallback, http, type PublicClient } from 'viem';

export function createApiChainClient(environment: { RPC_URL: string; RPC_BACKUP_URL?: string }): PublicClient {
  const transports = [http(environment.RPC_URL, { retryCount: 2 })];
  if (environment.RPC_BACKUP_URL) transports.push(http(environment.RPC_BACKUP_URL, { retryCount: 2 }));
  return createPublicClient({ transport: fallback(transports) });
}

export type ApiChainClient = PublicClient;
