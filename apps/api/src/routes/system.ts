import type { FastifyInstance } from 'fastify';

export async function registerSystemRoutes(
  app: FastifyInstance,
  environment: {
    network: 'testnet' | 'mainnet';
    chainId: number;
    chainName: string;
    explorerUrl: string;
  },
) {
  app.get('/v1/config', async () => ({
    network: environment.network,
    chainId: environment.chainId,
    chainIdHex: `0x${environment.chainId.toString(16)}`,
    chainName: environment.chainName,
    explorerUrl: environment.explorerUrl,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  }));
}
