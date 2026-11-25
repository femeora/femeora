import { createHash } from 'node:crypto';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { tryGetFomeoraDeployment } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import { loadApiEnvironment } from '@fomeora/env';
import Fastify from 'fastify';
import type { Address, Hex } from 'viem';

import { SESSION_COOKIE_NAME } from './core/auth/session.js';
import { createApiChainClient } from './core/chain-client.js';
import { OutboxWakeup, pruneOutboxEvents } from './core/realtime/outbox.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCalloutRoutes } from './routes/callouts.js';
import { registerFeedRoutes } from './routes/feed.js';
import { registerLaunchRoutes } from './routes/launches.js';
import { registerPoolCreationRoutes } from './routes/pool-creation.js';
import { registerPoolRoutes } from './routes/pools.js';
import { registerPositionActionRoutes } from './routes/position-actions.js';
import { registerPositionCreateRoutes } from './routes/position-create.js';
import { registerPositionRoutes } from './routes/positions.js';
import { registerRealtimeRoutes } from './routes/realtime.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerSwapRoutes } from './routes/swaps.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerTailPrepareRoutes } from './routes/tail-prepare.js';
import { registerTailRoutes } from './routes/tail.js';

export async function createServer(environment = loadApiEnvironment()) {
  const app = Fastify({
    disableRequestLogging: true,
    // Railway terminates TLS at the edge and forwards one client hop. Trusting
    // exactly that hop keeps IP-based abuse limits useful without accepting an
    // arbitrary client-supplied X-Forwarded-For chain.
    trustProxy: 1,
    logger: {
      base: null,
      level: environment.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
          '*.DATABASE_URL',
          '*.RPC_URL',
          '*.RPC_FALLBACK_URL',
          '*.RPC_INDEXER',
          '*.X_CLIENT_SECRET',
          '*.X_APP_BEARER_TOKEN',
          '*.DEPLOYER_PRIVATE_KEY',
          '*.PRIVATE_KEY',
        ],
        censor: '[REDACTED]',
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    if ('code' in error && error.code === 'P2024') {
      request.log.warn({ route: request.routeOptions.url }, 'Database connection pool was temporarily busy.');
      return reply.status(503).send({ error: 'SERVICE_TEMPORARILY_BUSY' });
    }
    return reply.send(error);
  });

  // Security Plugins
  await app.register(helmet, {
    contentSecurityPolicy: true,
  });

  await app.register(cors, {
    origin: environment.WEB_BASE_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    // Public reads are intentionally not covered by one global IP bucket.
    // Browser traffic reaches this service through the web BFF, so an IP
    // bucket here would make unrelated visitors consume the same allowance.
    // Sensitive and write-heavy routes opt in with their own route limits.
    global: false,
    keyGenerator: request => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      return token
        ? `session:${createHash('sha256').update(token).digest('hex')}`
        : `ip:${request.ip}`;
    },
  });

  const outboxWakeup = new OutboxWakeup(environment.DATABASE_URL);
  const chainClient = createApiChainClient({
    RPC_URL: environment.RPC_URL,
    ...(environment.RPC_FALLBACK_URL
      ? { RPC_FALLBACK_URL: environment.RPC_FALLBACK_URL }
      : {}),
  });
  await outboxWakeup.start();
  const retentionTimer = setInterval(
    () => {
      void pruneOutboxEvents().catch(() => app.log.warn('Outbox retention pass failed.'));
    },
    60 * 60 * 1_000
  );
  retentionTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(retentionTimer);
    await outboxWakeup.stop();
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    if (environment.WEB_BASE_URL && request.headers.origin !== environment.WEB_BASE_URL) {
      return reply.status(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      return reply.status(415).send({ error: 'JSON_REQUIRED' });
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url === '/v1/me' || request.url.startsWith('/v1/auth/')) {
      reply.header('cache-control', 'no-store, max-age=0');
      reply.header('pragma', 'no-cache');
    }
    return payload;
  });

  app.get('/health', async (_request, reply) => {
    try {
      const health = await prisma.indexerHealth.findUnique({
        where: { chainId: environment.CHAIN_ID },
      });
      const fresh = health ? Date.now() - health.updatedAt.getTime() < 5 * 60 * 1_000 : false;
      return {
        status: health?.status === 'healthy' && fresh ? 'ok' : 'degraded',
        database: 'ok',
        chainId: environment.CHAIN_ID,
        indexer: health
          ? {
              status: health.status,
              latestBlock: health.latestBlock.toString(),
              safeBlock: health.safeBlock.toString(),
              lastIndexedBlock: health.lastIndexedBlock?.toString() ?? null,
              lagBlocks: health.lagBlocks.toString(),
              lastSuccessAt: health.lastSuccessAt?.toISOString() ?? null,
              fresh,
            }
          : null,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return reply.status(503).send({ status: 'unavailable', database: 'error' });
    }
  });

  await registerAuthRoutes(app, {
    chainId: environment.CHAIN_ID,
    webBaseUrl: environment.WEB_BASE_URL,
    ...(environment.X_CLIENT_ID ? { xClientId: environment.X_CLIENT_ID } : {}),
    ...(environment.X_CLIENT_SECRET ? { xClientSecret: environment.X_CLIENT_SECRET } : {}),
  });
  await registerCalloutRoutes(app, environment.CHAIN_ID);
  await registerFeedRoutes(app, environment.CHAIN_ID);
  await registerLaunchRoutes(app, environment.CHAIN_ID, chainClient, {
    ...(environment.LAUNCHPAD_FACTORY_ADDRESS ? { launchpadFactory: environment.LAUNCHPAD_FACTORY_ADDRESS as Address } : {}),
    ...(environment.LAUNCH_FACTORY_ADDRESS ? { launchFactory: environment.LAUNCH_FACTORY_ADDRESS as Address } : {}),
    ...(environment.LAUNCH_IDENTITY_VERIFIER_ADDRESS ? { identityVerifier: environment.LAUNCH_IDENTITY_VERIFIER_ADDRESS as Address } : {}),
    ...(environment.GRADUATOR_ADDRESS ? { graduator: environment.GRADUATOR_ADDRESS as Address } : {}),
    ...(environment.LAUNCH_IDENTITY_SIGNER_PRIVATE_KEY ? { identitySignerPrivateKey: environment.LAUNCH_IDENTITY_SIGNER_PRIVATE_KEY as Hex } : {}),
  });
  await registerPoolRoutes(app, environment.CHAIN_ID);
  await registerPoolCreationRoutes(app, environment.CHAIN_ID, chainClient);
  await registerPositionRoutes(app, environment.CHAIN_ID);
  await registerPositionCreateRoutes(app, environment.CHAIN_ID, chainClient);
  await registerPositionActionRoutes(app, environment.CHAIN_ID, chainClient);
  await registerRealtimeRoutes(app, environment.CHAIN_ID, outboxWakeup);
  await registerSocialRoutes(app, environment.CHAIN_ID);
  await registerTailRoutes(app, environment.CHAIN_ID);
  await registerTailPrepareRoutes(app, environment.CHAIN_ID, chainClient);
  await registerSystemRoutes(app, {
    network: environment.APP_NETWORK,
    chainId: environment.CHAIN_ID,
    chainName: environment.CHAIN_NAME,
    explorerUrl: environment.EXPLORER_URL,
    protocolDeployed: Boolean(tryGetFomeoraDeployment(environment.CHAIN_ID)),
  });
  await registerSwapRoutes(app, environment.CHAIN_ID, chainClient);

  return app;
}

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await createServer(environment);
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Fomeora API shutting down.');
    const forceExit = setTimeout(() => {
      app.log.error('Fomeora API graceful shutdown timed out.');
      process.exit(1);
    }, 15_000);
    forceExit.unref();
    try {
      await app.close();
      await prisma.$disconnect();
      clearTimeout(forceExit);
    } catch {
      app.log.error('Fomeora API shutdown failed; inspect redacted platform diagnostics.');
      process.exitCode = 1;
    }
  };
  const onSigint = () => void shutdown('SIGINT');
  const onSigterm = () => void shutdown('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  try {
    await app.listen({ port: environment.PORT, host: '0.0.0.0' });
    app.log.info(`Fomeora API Server listening on port ${environment.PORT}`);
  } catch {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    await app.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    app.log.error('Fomeora API failed to start; inspect redacted platform diagnostics.');
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
