import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { db } from '@onbae/db';

import { bootstrapCoreRecords } from './bootstrap.js';
import { env } from './env.js';
import { matchQueue, redis } from './lib/queue.js';
import { actorRoutes } from './routes/actors.js';
import { matchRoutes } from './routes/matches.js';
import { publicRoutes } from './routes/public.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.x-onbae-admin-key',
        'headers.authorization',
        'headers.x-onbae-admin-key',
      ],
      censor: '[REDACTED]',
    },
  },
  trustProxy: env.TRUST_PROXY,
  requestIdHeader: 'x-request-id',
});

await app.register(helmet, {
  contentSecurityPolicy: false,
});
await app.register(cors, {
  origin: env.CORS_ORIGINS,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
});
await app.register(rateLimit, {
  max: 180,
  timeWindow: '1 minute',
});

app.setErrorHandler((error: unknown, request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'validation_error',
      issues: error.issues,
      requestId: request.id,
    });
  }

  const maybeStatusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  const statusCode = typeof maybeStatusCode === 'number' ? maybeStatusCode : 500;
  const message = error instanceof Error ? error.message : 'Request failed.';

  if (statusCode >= 500) {
    request.log.error({ err: error }, 'unhandled request error');
  }

  return reply.code(statusCode).send({
    error: statusCode >= 500 ? 'internal_error' : message,
    requestId: request.id,
  });
});

await publicRoutes(app);
await actorRoutes(app);
await matchRoutes(app);

async function start() {
  await bootstrapCoreRecords();
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
}

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await matchQueue.close();
  await redis.quit();
  await db.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (error: unknown) => {
  app.log.fatal({ err: error }, 'failed to start API');
  await db.$disconnect();
  process.exit(1);
});
