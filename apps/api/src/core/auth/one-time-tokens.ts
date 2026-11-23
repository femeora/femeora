import { prisma } from '@fomeora/database';

import { createOpaqueToken, hashOpaqueToken } from '../security/tokens.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;
const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1_000;

export async function createOAuthState(redirectPath?: string) {
  const token = createOpaqueToken();
  await prisma.oAuthState.create({
    data: {
      stateHash: hashOpaqueToken(token),
      redirectPath: redirectPath ?? null,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    },
  });
  return token;
}

export async function consumeOAuthState(token: string) {
  const stateHash = hashOpaqueToken(token);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const consumed = await transaction.oAuthState.updateMany({
      where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;
    return transaction.oAuthState.findUnique({ where: { stateHash } });
  });
}

export interface WalletChallengeInput {
  readonly userId: string;
  readonly walletAddress: string;
  readonly messageHash: string;
  readonly chainId: number;
}

export async function createWalletChallenge(input: WalletChallengeInput) {
  const nonce = createOpaqueToken();
  await prisma.walletLinkChallenge.create({
    data: {
      userId: input.userId,
      walletAddress: input.walletAddress.toLowerCase(),
      nonceHash: hashOpaqueToken(nonce),
      messageHash: input.messageHash.toLowerCase(),
      chainId: input.chainId,
      expiresAt: new Date(Date.now() + WALLET_CHALLENGE_TTL_MS),
    },
  });
  return nonce;
}

export async function consumeWalletChallenge(nonce: string) {
  const nonceHash = hashOpaqueToken(nonce);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const consumed = await transaction.walletLinkChallenge.updateMany({
      where: { nonceHash, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;
    return transaction.walletLinkChallenge.findUnique({ where: { nonceHash } });
  });
}
