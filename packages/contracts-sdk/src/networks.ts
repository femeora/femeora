import type { FomeoraChainId } from './generated/deployments.js';

export interface FomeoraNetwork {
  readonly id: FomeoraChainId;
  readonly name: string;
  readonly network: 'testnet' | 'mainnet';
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: 18;
  };
  readonly testnet: boolean;
}

/** Public chain metadata only. RPC URLs remain server-side environment values. */
export const robinhoodChainTestnet = {
  id: 46_630,
  name: 'Robinhood Chain Testnet',
  network: 'testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  testnet: true,
} as const satisfies FomeoraNetwork;

export const fomeoraNetworks = {
  [robinhoodChainTestnet.id]: robinhoodChainTestnet,
} as const;
