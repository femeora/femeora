'use client';

import {
  ApiMeSchema,
  ApiWalletChallengeSchema,
  ApiWalletLinkSchema,
  type ApiMe,
} from '@fomeora/types';
import { z } from 'zod';
import { create } from 'zustand';

import { connectInjectedWallet, signWalletMessage } from '@/features/wallet/adapter';
import { BrowserApiError, browserApiRequest } from '@/lib/api/client';

export interface SessionUser {
  id: string;
  handle: string;
  name: string;
  initials: string;
  verified: boolean;
  avatarUrl: string | null;
  wallet: string | null;
  wallets: string[];
}

type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionState {
  user: SessionUser | null;
  status: SessionStatus;
  error: string | null;
  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  refreshSession: () => Promise<void>;
  startXSignIn: () => void;
  linkWallet: () => Promise<void>;
  signOut: () => Promise<void>;
}

function toSessionUser(user: ApiMe): SessionUser {
  const displayName = user.name?.trim() || user.handle;
  return {
    id: user.id,
    handle: user.handle,
    name: displayName,
    initials: displayName.slice(0, 2).toUpperCase(),
    verified: user.xVerified,
    avatarUrl: user.avatarUrl,
    wallet: user.wallets[0] ?? null,
    wallets: user.wallets,
  };
}

function errorCode(error: unknown): string {
  if (error instanceof BrowserApiError) return error.code;
  if (error instanceof Error && error.message) return error.message;
  return 'SESSION_REQUEST_FAILED';
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  status: 'loading',
  error: null,
  signInOpen: false,
  openSignIn: () => set({ signInOpen: true, error: null }),
  closeSignIn: () => set({ signInOpen: false, error: null }),
  refreshSession: async () => {
    try {
      const user = await browserApiRequest('/v1/me', ApiMeSchema);
      set({
        user: toSessionUser(user),
        status: 'authenticated',
        error: null,
        signInOpen: user.wallets.length === 0,
      });
    } catch (error) {
      if (error instanceof BrowserApiError && error.status === 401) {
        const authError = new URLSearchParams(window.location.search).get('auth_error');
        set({
          user: null,
          status: 'anonymous',
          error: authError,
          signInOpen: Boolean(authError),
        });
        return;
      }
      set({ user: null, status: 'anonymous', error: errorCode(error) });
    }
  },
  startXSignIn: () => {
    window.location.assign('/api/v1/auth/x/start?redirect=/portfolio');
  },
  linkWallet: async () => {
    set({ error: null });
    try {
      const { account: walletAddress } = await connectInjectedWallet();
      if (!walletAddress) throw new Error('WALLET_ACCOUNT_REQUIRED');
      const challenge = await browserApiRequest(
        '/v1/auth/wallet/challenge',
        ApiWalletChallengeSchema,
        { method: 'POST', body: { walletAddress } },
      );
      const signature = await signWalletMessage(challenge.message, walletAddress);
      await browserApiRequest('/v1/auth/wallet/verify', ApiWalletLinkSchema, {
        method: 'POST',
        body: { challengeId: challenge.challengeId, nonce: challenge.nonce, signature },
      });
      await get().refreshSession();
      set({ signInOpen: false });
    } catch (error) {
      set({ error: errorCode(error) });
    }
  },
  signOut: async () => {
    try {
      await browserApiRequest('/v1/auth/logout', z.undefined(), { method: 'POST' });
    } finally {
      set({ user: null, status: 'anonymous', signInOpen: false, error: null });
    }
  },
}));
