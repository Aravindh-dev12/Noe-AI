import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { db } from '@onbae/db';

import { bootstrapCoreRecords } from './bootstrap.js';
import { env } from './env.js';
import { matchQueue, redis } from './lib/queue.js';
import { accountabilityRoutes } from './routes/accountability.js';
import { actorResolutionRoutes } from './routes/actor-resolution.js';
import { actorRoutes } from './routes/actors.js';
import { authRoutes } from './routes/auth.js';
import { authorityRoutes } from './routes/authority.js';
import { capabilityContinuityRoutes } from './routes/capability-continuity.js';
import { collectiveActionProvenanceRoutes } from './routes/collective-action-provenance.js';
import { collectiveRoutes } from './routes/collectives.js';
import { continuityRoutes } from './routes/continuity.js';
import { controlContinuityRoutes } from './routes/control-continuity.js';
import { dependencyImpactRoutes } from './routes/dependency-impact.js';
import { dependencyRoutes } from './routes/dependencies.js';
import { externalStateContinuityRoutes } from './routes/external-state-continuity.js';
import { hostRoutes } from './routes/hosts.js';
import { institutionalSuccessionRoutes } from './routes/institutional-succession.js';
import { institutionalRoutes } from './routes/institutional.js';
import { intentContinuityRoutes } from './routes/intent-continuity.js';
import { matchRoutes } from './routes/matches.js';
import { passportRoutes } from './routes/passports.js';
import { publicRoutes } from './routes/public.js';
import { recognitionContinuityRoutes } from './routes/recognition-continuity.js';
import { verificationRoutes } from './routes/verification.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-noe-admin-key',
        'req.headers.x-noeone-admin-key',
        'req.headers.x-onbae-admin-key',
        'headers.authorization',
        'headers.cookie',
        'headers.x-noe-admin-key',
        'headers.x-noeone-admin-key',
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
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-NOE-Admin-Key',
    'X-NOEONE-Admin-Key',
    'X-Onbae-Admin-Key',
  ],
  maxAge: 86_400,
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

await authRoutes(app);
await publicRoutes(app);
await actorRoutes(app);
await continuityRoutes(app);
await recognitionContinuityRoutes(app);
await externalStateContinuityRoutes(app);
await controlContinuityRoutes(app);
await authorityRoutes(app);
await intentContinuityRoutes(app);
await capabilityContinuityRoutes(app);
await accountabilityRoutes(app);
await dependencyRoutes(app);
await dependencyImpactRoutes(app);
await actorResolutionRoutes(app);
await matchRoutes(app);
await hostRoutes(app);
await institutionalRoutes(app);
await institutionalSuccessionRoutes(app);
await collectiveRoutes(app);
await collectiveActionProvenanceRoutes(app);
await verificationRoutes(app);
await passportRoutes(app);

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
  app.log.fatal({ err: error }, 'failed to start NOE API');
  await db.$disconnect();
  process.exit(1);
});
