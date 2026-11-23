'use client';

import { useEffect } from 'react';

import { useWallet } from '@/features/wallet/store';

import { useSession } from './store';

/** Resolves the HttpOnly API session and initializes the injected wallet after mount. */
export function useRehydrateStores() {
  useEffect(() => {
    let active = true;
    let stopWallet: () => void = () => undefined;
    void useSession.getState().refreshSession();
    void useWallet.getState().initialize().then(stop => {
      if (active) stopWallet = stop;
      else stop();
    });
    return () => {
      active = false;
      stopWallet();
    };
  }, []);
}
