import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  buildWalletChallengeMessage,
  normalizeWalletAddress,
  walletChallengeMessageHash,
} from './wallet-link.js';

test('builds a deterministic message bound to domain, origin, wallet, chain, nonce and expiry', () => {
  const message = buildWalletChallengeMessage({
    webBaseUrl: 'https://testnet.femeora.example/path-is-ignored',
    walletAddress: '0x00000000000000000000000000000000000000AA',
    chainId: 46_630,
    nonce: 'test-nonce',
    issuedAt: new Date('2026-11-23T00:00:00.000Z'),
    expiresAt: new Date('2026-11-23T00:10:00.000Z'),
  });
  assert.match(message, /Domain: testnet\.femeora\.example/);
  assert.match(message, /Origin: https:\/\/testnet\.femeora\.example/);
  assert.match(message, /Wallet: 0x00000000000000000000000000000000000000aa/);
  assert.match(message, /Chain ID: 46630/);
  assert.match(message, /Nonce: test-nonce/);
  assert.match(message, /Expiration Time: 2026-11-23T00:10:00\.000Z/);
  assert.match(walletChallengeMessageHash(message), /^0x[0-9a-f]{64}$/);
});

test('verifies one EIP-191 signature only for the exact message and wallet', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const message = buildWalletChallengeMessage({
    webBaseUrl: 'https://testnet.femeora.example',
    walletAddress: account.address,
    chainId: 46_630,
    nonce: 'nonce-bound-to-message',
    issuedAt: new Date('2026-11-23T00:00:00.000Z'),
    expiresAt: new Date('2026-11-23T00:10:00.000Z'),
  });
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  assert.equal(await verifyMessage({ address: account.address, message: `${message}\nmodified`, signature }), false);
  assert.equal(normalizeWalletAddress(account.address), account.address.toLowerCase());
});
