import { createHash } from 'node:crypto';

import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { verifyMessage } from 'viem';
import { z } from 'zod';

import {
  createSession,
  resolveSession,
  revokeSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from '../core/auth/session.js';
import {
  buildWalletChallengeMessage,
  MAX_WALLETS_PER_USER,
  normalizeWalletAddress,
  WALLET_CHALLENGE_TTL_SECONDS,
  walletChallengeMessageHash,
} from '../core/auth/wallet-link.js';
import { createOpaqueToken, hashOpaqueToken } from '../core/security/tokens.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(normalizeWalletAddress);
const challengeRequestSchema = z.object({
  walletAddress: addressSchema,
});
const verifyRequestSchema = z.object({
  challengeId: z.string().uuid(),
  nonce: z.string().min(32).max(128),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
});
const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(32).max(256),
});
const xTokenSchema = z.object({ access_token: z.string().min(1) });
const xUserSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    name: z.string().nullable().optional(),
    profile_image_url: z.string().url().nullable().optional(),
    verified: z.boolean().optional(),
    public_metrics: z.object({ followers_count: z.number().int().nonnegative() }).optional(),
  }),
});

const OAUTH_COOKIE_NAME = 'fomeora_x_oauth';
const OAUTH_TTL_SECONDS = 10 * 60;
const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/api/v1/auth/x/callback',
  maxAge: OAUTH_TTL_SECONDS,
} as const;

function base64UrlSha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function safeRedirectPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value.slice(0, 512)
    : '/portfolio';
}

function redirectWithError(reply: FastifyReply, webBaseUrl: string, code: string) {
  const destination = new URL('/portfolio', webBaseUrl);
  destination.searchParams.set('auth_error', code);
  return reply.redirect(destination.toString());
}

class WalletLinkError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(code);
  }
}

class XAuthUpstreamError extends Error {
  constructor(readonly publicCode: string) {
    super(publicCode);
  }
}

function xReadFailure(status: number): XAuthUpstreamError {
  if (status === 402) return new XAuthUpstreamError('X_API_CREDITS_REQUIRED');
  if (status === 429) return new XAuthUpstreamError('X_API_RATE_LIMITED');
  return new XAuthUpstreamError('X_AUTH_UPSTREAM_FAILED');
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  environment: { chainId: number; webBaseUrl: string; xClientId?: string; xClientSecret?: string },
) {
  app.get(
    '/v1/auth/x/start',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!environment.xClientId || !environment.xClientSecret) {
        return reply.status(503).send({ error: 'X_AUTH_NOT_CONFIGURED' });
      }
      const query = z.object({ redirect: z.string().max(2_048).optional() }).safeParse(request.query);
      if (!query.success) return reply.status(400).send({ error: 'INVALID_AUTH_REDIRECT' });
      const redirectPath = safeRedirectPath(query.data.redirect);
      const state = createOpaqueToken();
      const verifier = createOpaqueToken() + createOpaqueToken();
      await prisma.oAuthState.create({
        data: {
          stateHash: hashOpaqueToken(state),
          redirectPath,
          expiresAt: new Date(Date.now() + OAUTH_TTL_SECONDS * 1_000),
        },
      });
      reply.setCookie(OAUTH_COOKIE_NAME, verifier, OAUTH_COOKIE_OPTIONS);
      const authorize = new URL('https://x.com/i/oauth2/authorize');
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', environment.xClientId);
      authorize.searchParams.set('redirect_uri', `${environment.webBaseUrl}/api/v1/auth/x/callback`);
      authorize.searchParams.set('scope', 'tweet.read users.read');
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', base64UrlSha256(verifier));
      authorize.searchParams.set('code_challenge_method', 'S256');
      return reply.redirect(authorize.toString());
    },
  );

  // Keep the callback's validation gates linear so every failure exits before session issuance.
  // eslint-disable-next-line complexity
  app.get('/v1/auth/x/callback', async (request, reply) => {
    const parsed = oauthCallbackSchema.safeParse(request.query);
    const verifier = request.cookies[OAUTH_COOKIE_NAME];
    reply.clearCookie(OAUTH_COOKIE_NAME, OAUTH_COOKIE_OPTIONS);
    if (!environment.xClientId || !environment.xClientSecret || !parsed.success || !verifier) {
      return redirectWithError(reply, environment.webBaseUrl, 'X_AUTH_INVALID');
    }

    const now = new Date();
    const stateHash = hashOpaqueToken(parsed.data.state);
    const oauthState = await prisma.$transaction(async transaction => {
      const consumed = await transaction.oAuthState.updateMany({
        where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      return transaction.oAuthState.findUnique({ where: { stateHash } });
    });
    if (!oauthState) return redirectWithError(reply, environment.webBaseUrl, 'X_AUTH_STATE_INVALID');

    try {
      const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${environment.xClientId}:${environment.xClientSecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: parsed.data.code,
          redirect_uri: `${environment.webBaseUrl}/api/v1/auth/x/callback`,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const token = xTokenSchema.safeParse(await tokenResponse.json());
      if (!tokenResponse.ok) throw xReadFailure(tokenResponse.status);
      if (!token.success) throw new XAuthUpstreamError('X_AUTH_UPSTREAM_FAILED');

      const userResponse = await fetch(
        'https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics,verified',
        {
          headers: { authorization: `Bearer ${token.data.access_token}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const profile = xUserSchema.safeParse(await userResponse.json());
      if (!userResponse.ok) throw xReadFailure(userResponse.status);
      if (!profile.success) throw new XAuthUpstreamError('X_AUTH_UPSTREAM_FAILED');
      const xUser = profile.data.data;
      const user = await prisma.user.upsert({
        where: { xId: xUser.id },
        create: {
          xId: xUser.id,
          handle: xUser.username,
          name: xUser.name ?? null,
          avatarUrl: xUser.profile_image_url ?? null,
          xVerified: xUser.verified ?? false,
          xFollowers: xUser.public_metrics?.followers_count ?? 0,
          xProfileRefreshedAt: now,
        },
        update: {
          handle: xUser.username,
          name: xUser.name ?? null,
          avatarUrl: xUser.profile_image_url ?? null,
          xVerified: xUser.verified ?? false,
          xFollowers: xUser.public_metrics?.followers_count ?? 0,
          xProfileRefreshedAt: now,
        },
      });
      const sessionToken = await createSession(user.id);
      reply.setCookie(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);
      return reply.redirect(
        new URL(oauthState.redirectPath ?? '/portfolio', environment.webBaseUrl).toString(),
      );
    } catch (error) {
      return redirectWithError(
        reply,
        environment.webBaseUrl,
        error instanceof XAuthUpstreamError ? error.publicCode : 'X_AUTH_UPSTREAM_FAILED',
      );
    }
  });

  app.get('/v1/me', async (request, reply) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    return {
      id: session.user.id,
      handle: session.user.handle,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      xVerified: session.user.xVerified,
      wallets: session.user.wallets.map(wallet => wallet.address),
    };
  });

  app.post('/v1/auth/logout', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    await revokeSession(request.cookies[SESSION_COOKIE_NAME]);
    reply.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
    return reply.status(204).send();
  });

  app.post(
    '/v1/auth/wallet/challenge',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
      if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
      const parsed = challengeRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_WALLET_CHALLENGE' });
      }

      const existingWallet = await prisma.wallet.findUnique({
        where: { address: parsed.data.walletAddress },
        select: { userId: true },
      });
      if (existingWallet?.userId !== undefined && existingWallet.userId !== session.userId) {
        return reply.status(409).send({ error: 'WALLET_ALREADY_LINKED' });
      }
      if (!existingWallet) {
        const walletCount = await prisma.wallet.count({ where: { userId: session.userId } });
        if (walletCount >= MAX_WALLETS_PER_USER) {
          return reply.status(409).send({ error: 'WALLET_LIMIT_REACHED' });
        }
      }

      const nonce = createOpaqueToken();
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + WALLET_CHALLENGE_TTL_SECONDS * 1_000);
      const message = buildWalletChallengeMessage({
        webBaseUrl: environment.webBaseUrl,
        walletAddress: parsed.data.walletAddress,
        chainId: environment.chainId,
        nonce,
        issuedAt,
        expiresAt,
      });
      const challenge = await prisma.walletLinkChallenge.create({
        data: {
          userId: session.userId,
          walletAddress: parsed.data.walletAddress,
          nonceHash: hashOpaqueToken(nonce),
          messageHash: walletChallengeMessageHash(message),
          chainId: environment.chainId,
          createdAt: issuedAt,
          expiresAt,
        },
        select: { id: true },
      });
      return reply.status(201).send({
        challengeId: challenge.id,
        message,
        nonce,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  app.post(
    '/v1/auth/wallet/verify',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
      if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
      const parsed = verifyRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'INVALID_WALLET_VERIFICATION' });

      const challenge = await prisma.walletLinkChallenge.findUnique({
        where: { id: parsed.data.challengeId },
      });
      const now = new Date();
      if (
        !challenge ||
        challenge.userId !== session.userId ||
        challenge.chainId !== environment.chainId ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.nonceHash !== hashOpaqueToken(parsed.data.nonce)
      ) {
        return reply.status(400).send({ error: 'WALLET_CHALLENGE_INVALID_OR_EXPIRED' });
      }

      const message = buildWalletChallengeMessage({
        webBaseUrl: environment.webBaseUrl,
        walletAddress: challenge.walletAddress,
        chainId: challenge.chainId,
        nonce: parsed.data.nonce,
        issuedAt: challenge.createdAt,
        expiresAt: challenge.expiresAt,
      });
      if (walletChallengeMessageHash(message) !== challenge.messageHash) {
        return reply.status(400).send({ error: 'WALLET_MESSAGE_MISMATCH' });
      }
      const signatureValid = await verifyMessage({
        address: normalizeWalletAddress(challenge.walletAddress),
        message,
        signature: parsed.data.signature as `0x${string}`,
      }).catch(() => false);
      if (!signatureValid) return reply.status(400).send({ error: 'WALLET_SIGNATURE_INVALID' });

      try {
        const wallet = await prisma.$transaction(async transaction => {
          await transaction.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))',
            session.userId,
            challenge.walletAddress,
          );
          const consumed = await transaction.walletLinkChallenge.updateMany({
            where: {
              id: challenge.id,
              userId: session.userId,
              nonceHash: hashOpaqueToken(parsed.data.nonce),
              consumedAt: null,
              expiresAt: { gt: now },
            },
            data: { consumedAt: now },
          });
          if (consumed.count !== 1) throw new WalletLinkError('WALLET_CHALLENGE_ALREADY_USED', 409);

          const existing = await transaction.wallet.findUnique({
            where: { address: challenge.walletAddress },
          });
          if (existing) {
            if (existing.userId !== session.userId) throw new WalletLinkError('WALLET_ALREADY_LINKED', 409);
            return existing;
          }
          const walletCount = await transaction.wallet.count({ where: { userId: session.userId } });
          if (walletCount >= MAX_WALLETS_PER_USER) throw new WalletLinkError('WALLET_LIMIT_REACHED', 409);
          return transaction.wallet.create({
            data: { address: challenge.walletAddress, userId: session.userId, verifiedAt: now },
          });
        });
        return { address: wallet.address, linked: true };
      } catch (error) {
        if (error instanceof WalletLinkError) {
          return reply.status(error.statusCode).send({ error: error.code });
        }
        return reply.status(409).send({ error: 'WALLET_LINK_CONFLICT' });
      }
    },
  );
}
