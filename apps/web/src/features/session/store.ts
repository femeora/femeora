'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Identity from Sign in with X (brief 4.1): handle, name, avatar initials, verified badge. */
export interface SessionUser {
  handle: string;
  name: string;
  initials: string;
  verified: boolean;
  /** Wallet linked with a SIWE signature (brief 4.2). */
  wallet: string;
}

interface SessionState {
  user: SessionUser | null;
  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  /** Completes X login and wallet linking for `handle`. */
  signIn: (handle: string) => void;
  signOut: () => void;
}

/** Deterministic display wallet for a handle until the SIWE flow returns a real address. */
function walletFor(handle: string): string {
  const hex = [...handle]
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7)
    .toString(16);
  return `0x${hex.padStart(4, '0').slice(0, 4)}…${hex.padEnd(4, 'a').slice(-4)}`;
}

/**
 * Session state for the app. The sign-in action is the single seam to replace with
 * `GET /v1/auth/x/start` + `POST /v1/auth/siwe/verify` (brief 11).
 */
export const useSession = create<SessionState>()(
  persist(
    set => ({
      user: null,
      signInOpen: false,
      openSignIn: () => set({ signInOpen: true }),
      closeSignIn: () => set({ signInOpen: false }),
      signIn: handle =>
        set({
          signInOpen: false,
          user: {
            handle,
            name: handle,
            initials: handle.slice(0, 2).toUpperCase(),
            verified: true,
            wallet: walletFor(handle),
          },
        }),
      signOut: () => set({ user: null }),
    }),
    {
      name: 'fomeora-session',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ user: state.user }),
      // Rehydrated after mount (see AppShell) so the server and first client render agree.
      skipHydration: true,
    }
  )
);
