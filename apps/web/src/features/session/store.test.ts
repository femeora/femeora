import assert from 'node:assert/strict';
import test from 'node:test';

import { useSession } from './store';

const userId = '11111111-1111-4111-8111-111111111111';
const wallet = '0x00000000000000000000000000000000000000aa';
const signature = `0x${'ab'.repeat(65)}`;

test('session is sourced from /v1/me and links an injected wallet through one challenge', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const methods: string[] = [];
  const urls: string[] = [];
  let linked = false;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search: '', assign: () => undefined },
      ethereum: {
        request: async ({ method }: { method: string }) => {
          methods.push(method);
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [wallet];
          if (method === 'eth_chainId') return '0xb626';
          return signature;
        },
      },
    },
  });
  globalThis.fetch = async input => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/wallet/challenge')) {
      return Response.json({
        challengeId: '22222222-2222-4222-8222-222222222222',
        message: 'Femeora wallet ownership verification',
        nonce: 'n'.repeat(32),
        expiresAt: '2026-11-23T00:10:00.000Z',
      }, { status: 201 });
    }
    if (url.endsWith('/wallet/verify')) {
      linked = true;
      return Response.json({ address: wallet, linked: true });
    }
    return Response.json({
      id: userId,
      handle: 'femeoraApp',
      name: 'Femeora',
      avatarUrl: null,
      xVerified: true,
      wallets: linked ? [wallet] : [],
    });
  };

  try {
    useSession.setState({ user: null, status: 'loading', signInOpen: false, error: null });
    await useSession.getState().refreshSession();
    assert.equal(useSession.getState().user?.handle, 'femeoraApp');
    assert.equal(useSession.getState().signInOpen, true);
    await useSession.getState().linkWallet();
    assert.deepEqual(methods, ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'personal_sign']);
    assert.deepEqual(urls, [
      '/api/v1/me',
      '/api/v1/auth/wallet/challenge',
      '/api/v1/auth/wallet/verify',
      '/api/v1/me',
    ]);
    assert.equal(useSession.getState().user?.wallet, wallet);
    assert.equal(useSession.getState().signInOpen, false);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});
