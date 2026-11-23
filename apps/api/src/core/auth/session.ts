import { prisma } from '@fomeora/database';

import { createOpaqueToken, hashOpaqueToken } from '../security/tokens.js';

export const SESSION_COOKIE_NAME = 'fomeora_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
} as const;

export async function createSession(userId: string): Promise<string> {
  const token = createOpaqueToken();
  const now = new Date();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1_000),
    },
  });
  return token;
}

export async function resolveSession(token: string | undefined) {
  if (!token) return null;
  const now = new Date();
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { user: { include: { wallets: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: now },
  });
  return session;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
