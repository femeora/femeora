import { randomUUID } from 'node:crypto';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

process.env.NODE_ENV = 'test';

const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createSession, SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { createServer } = await import('../src/index.js');

const app = await createServer(environment);
const userIds: string[] = [];

async function createVerificationUser(label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const user = await prisma.user.create({
    data: { xId: `verify-${label}-${suffix}`, handle: `verify_${label}_${suffix.slice(0, 12)}` },
    select: { id: true },
  });
  userIds.push(user.id);
  const token = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function requestChallenge(cookie: string, walletAddress: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/wallet/challenge',
    headers: { cookie, origin: environment.WEB_BASE_URL, 'content-type': 'application/json' },
    payload: { chainId: environment.CHAIN_ID, walletAddress },
  });
}

async function linkWallet(cookie: string, account: ReturnType<typeof privateKeyToAccount>) {
  const challengeResponse = await requestChallenge(cookie, account.address);
  if (challengeResponse.statusCode !== 201) throw new Error('VERIFY_CHALLENGE_FAILED');
  const challenge = challengeResponse.json<{
    challengeId: string;
    message: string;
    nonce: string;
  }>();
  const signature = await account.signMessage({ message: challenge.message });
  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/wallet/verify',
    headers: { cookie, origin: environment.WEB_BASE_URL, 'content-type': 'application/json' },
    payload: { challengeId: challenge.challengeId, nonce: challenge.nonce, signature },
  });
  return { challenge, verifyResponse };
}

try {
  await app.ready();
  const firstUser = await createVerificationUser('first');
  const firstWallet = privateKeyToAccount(generatePrivateKey());
  const firstLink = await linkWallet(firstUser.cookie, firstWallet);

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/auth/wallet/verify',
    headers: { cookie: firstUser.cookie, origin: environment.WEB_BASE_URL, 'content-type': 'application/json' },
    payload: {
      challengeId: firstLink.challenge.challengeId,
      nonce: firstLink.challenge.nonce,
      signature: await firstWallet.signMessage({ message: firstLink.challenge.message }),
    },
  });

  const secondUser = await createVerificationUser('second');
  const otherAccountClaim = await requestChallenge(secondUser.cookie, firstWallet.address);

  await linkWallet(firstUser.cookie, privateKeyToAccount(generatePrivateKey()));
  await linkWallet(firstUser.cookie, privateKeyToAccount(generatePrivateKey()));
  const fourthWallet = await requestChallenge(firstUser.cookie, privateKeyToAccount(generatePrivateKey()).address);

  const wrongOrigin = await app.inject({
    method: 'POST',
    url: '/v1/auth/wallet/challenge',
    headers: { cookie: firstUser.cookie, origin: 'https://wrong-origin.invalid', 'content-type': 'application/json' },
    payload: { chainId: environment.CHAIN_ID, walletAddress: firstWallet.address },
  });

  const result = {
    firstLinkSucceeded: firstLink.verifyResponse.statusCode === 200,
    challengeReplayDenied: replay.statusCode === 400 || replay.statusCode === 409,
    walletUniquenessEnforced: otherAccountClaim.statusCode === 409,
    threeWalletLimitEnforced: fourthWallet.statusCode === 409,
    wrongOriginDenied: wrongOrigin.statusCode === 403,
    storedWalletCountCorrect: (await prisma.wallet.count({ where: { userId: firstUser.id } })) === 3,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('WALLET_LINK_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'WALLET_LINK_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
}
