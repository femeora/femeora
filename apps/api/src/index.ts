import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { validateCalloutCaption } from './core/security/anti-phishing.js';

export async function createServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Security Plugins
  await app.register(helmet, {
    contentSecurityPolicy: true,
  });

  await app.register(cors, {
    origin: process.env.WEB_BASE_URL || 'http://localhost:3000',
    credentials: true,
  });

  await app.register(cookie, {
    secret: process.env.SESSION_SECRET || 'fomeora-development-secret-key-at-least-32-chars',
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check endpoint
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Callout intent endpoint (Dev Brief 5.4)
  app.post('/v1/callouts/intent', async (request, reply) => {
    const body = request.body as {
      chainId: number;
      pool: string;
      caption?: string;
    };
    if (body.caption) {
      const validation = validateCalloutCaption(body.caption);
      if (!validation.isValid) {
        return reply.status(400).send({ error: validation.error });
      }
    }

    // Generate intent ID and unique tag (bytes32 format)
    const intentId = crypto.randomUUID();
    const tag = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}`;

    return reply.status(201).send({
      intentId,
      tag,
      expiresInSeconds: 600,
    });
  });

  return app;
}

async function bootstrap() {
  const app = await createServer();
  const port = Number(process.env.PORT) || 4000;
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Fomeora API Server listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
