'use client';

import { ApiChainConfigSchema, type ApiChainConfig } from '@fomeora/types';
import { z } from 'zod';
import { create } from 'zustand';

import { browserApiRequest } from '@/lib/api/client';

import {
  connectWallet,
  disconnectWallet,
  injectedProvider,
  readWalletSnapshot,
  restoreWalletConnect,
  subscribeWallet,
  switchInjectedChain,
  WalletAdapterError,
  type WalletConnectSettings,
} from './adapter';

const WalletRuntimeConfigSchema = z.object({
  projectId: z.string().min(1).nullable(),
  rpcUrl: z.string().url(),
});

type WalletStatus = 'idle' | 'unavailable' | 'disconnected' | 'connecting' | 'connected';
const DISCONNECTED_KEY = 'fomeora.wallet.disconnected';

const isManuallyDisconnected = () => {
  try {
    return typeof window !== 'undefined' && window.sessionStorage?.getItem(DISCONNECTED_KEY) === '1';
  } catch {
    return false;
  }
};
const setManuallyDisconnected = (value: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage?.setItem(DISCONNECTED_KEY, '1');
    else window.sessionStorage?.removeItem(DISCONNECTED_KEY);
  } catch {
    // Storage can be unavailable in strict privacy contexts; wallet state still works in memory.
  }
};

interface WalletState {
  config: ApiChainConfig | null;
  account: `0x${string}` | null;
  chainId: number | null;
  status: WalletStatus;
  error: string | null;
  walletConnect: WalletConnectSettings | null;
  initialize: () => Promise<() => void>;
  connect: (source?: 'auto' | 'injected' | 'walletconnect') => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
}

const code = (error: unknown) => error instanceof WalletAdapterError ? error.code : 'WALLET_REQUEST_FAILED';

export const useWallet = create<WalletState>((set, get) => ({
  config: null,
  account: null,
  chainId: null,
  status: 'idle',
  error: null,
  walletConnect: null,
  initialize: async () => {
    const [config, walletResponse] = await Promise.all([
      browserApiRequest('/v1/config', ApiChainConfigSchema),
      fetch('/api/wallet-config', { cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error('WALLET_CONFIG_UNAVAILABLE');
        return WalletRuntimeConfigSchema.parse(await response.json());
      }),
    ]);
    const walletConnect = walletResponse.projectId
      ? {
          projectId: walletResponse.projectId,
          rpcUrl: walletResponse.rpcUrl,
          chainId: config.chainId,
          chainName: config.chainName,
        }
      : null;
    let provider = injectedProvider();
    if (!provider && walletConnect && !isManuallyDisconnected()) {
      try {
        const restored = await restoreWalletConnect(walletConnect);
        provider = restored?.provider ?? null;
      } catch {
        // A stale WalletConnect session must not prevent a fresh connection.
      }
    }
    if (!provider) {
      set({ config, walletConnect, status: walletConnect ? 'disconnected' : 'unavailable', error: null });
      return () => undefined;
    }
    const refresh = async () => {
      if (isManuallyDisconnected()) {
        set({ account: null, chainId: null, config, walletConnect, status: 'disconnected', error: null });
        return;
      }
      try {
        const snapshot = await readWalletSnapshot(provider);
        set({ ...snapshot, config, walletConnect, status: snapshot.account ? 'connected' : 'disconnected', error: null });
      } catch (error) {
        set({ account: null, chainId: null, status: 'disconnected', error: code(error) });
      }
    };
    await refresh();
    return subscribeWallet(provider, () => void refresh(), () => {
      set({ account: null, chainId: null, status: 'disconnected', error: 'WALLET_DISCONNECTED' });
    });
  },
  connect: async (source = 'auto') => {
    set({ status: 'connecting', error: null });
    try {
      setManuallyDisconnected(false);
      const snapshot = await connectWallet(get().walletConnect, source);
      set({ ...snapshot, status: 'connected', error: null });
    } catch (error) {
      set({ status: injectedProvider() || get().walletConnect ? 'disconnected' : 'unavailable', error: code(error) });
    }
  },
  disconnect: async () => {
    await disconnectWallet();
    setManuallyDisconnected(true);
    set({ account: null, chainId: null, status: 'disconnected', error: null });
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
