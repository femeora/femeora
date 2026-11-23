'use client';

import { ApiChainConfigSchema, type ApiChainConfig } from '@fomeora/types';
import { create } from 'zustand';

import { browserApiRequest } from '@/lib/api/client';

import {
  connectInjectedWallet,
  injectedProvider,
  readWalletSnapshot,
  subscribeWallet,
  switchInjectedChain,
  WalletAdapterError,
} from './adapter';

type WalletStatus = 'idle' | 'unavailable' | 'disconnected' | 'connecting' | 'connected';

interface WalletState {
  config: ApiChainConfig | null;
  account: `0x${string}` | null;
  chainId: number | null;
  status: WalletStatus;
  error: string | null;
  initialize: () => Promise<() => void>;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
}

const code = (error: unknown) => error instanceof WalletAdapterError ? error.code : 'WALLET_REQUEST_FAILED';

export const useWallet = create<WalletState>((set, get) => ({
  config: null,
  account: null,
  chainId: null,
  status: 'idle',
  error: null,
  initialize: async () => {
    const config = await browserApiRequest('/v1/config', ApiChainConfigSchema);
    const provider = injectedProvider();
    if (!provider) {
      set({ config, status: 'unavailable', error: null });
      return () => undefined;
    }
    const refresh = async () => {
      try {
        const snapshot = await readWalletSnapshot(provider);
        set({ ...snapshot, config, status: snapshot.account ? 'connected' : 'disconnected', error: null });
      } catch (error) {
        set({ account: null, chainId: null, status: 'disconnected', error: code(error) });
      }
    };
    await refresh();
    return subscribeWallet(provider, () => void refresh(), () => {
      set({ account: null, chainId: null, status: 'disconnected', error: 'WALLET_DISCONNECTED' });
    });
  },
  connect: async () => {
    set({ status: 'connecting', error: null });
    try {
      const snapshot = await connectInjectedWallet();
      set({ ...snapshot, status: 'connected', error: null });
    } catch (error) {
      set({ status: injectedProvider() ? 'disconnected' : 'unavailable', error: code(error) });
    }
  },
  switchNetwork: async () => {
    const config = get().config;
    if (!config) return set({ error: 'CHAIN_CONFIG_UNAVAILABLE' });
    try {
      await switchInjectedChain(config.chainId);
      const provider = injectedProvider();
      if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
      const snapshot = await readWalletSnapshot(provider);
      set({ ...snapshot, status: snapshot.account ? 'connected' : 'disconnected', error: null });
    } catch (error) {
      set({ error: code(error) });
    }
  },
}));
