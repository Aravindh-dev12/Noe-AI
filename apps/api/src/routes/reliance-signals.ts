import type { FastifyInstance } from 'fastify';
import {
  emitRelianceSignal,
  getActorRelianceBlastRadius,
  getRelianceSignalReceipts,
  getRelianceSignals,
  recordRelianceSignalReceipt,
  verifyRelianceSignalProvenance,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const boundedId = z.string().min(1).max(240);
const boundedText = z.string().min(1).max(1000);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const metadata = z.record(z.string(), z.json()).optional();
const transportProfile = z.enum(['internal', 'ssf', 'caep', 'webhook', 'manual', 'other']);
const listSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
  .strict();

const emitSchema = z
  .object({
    emittedAt: timestamp.optional(),
    idempotencyKey: z.string().min(8).max(500),
    metadata,
  })
  .strict();

const receiptSchema = z
  .object({
    kind: z.enum([
      'delivered',
      'delivery-failed',
      'acknowledged',
      'review-started',
      'reliance-renewed',
      'reliance-rejected',
      'expired',
    ]),
    partyType: z.string().min(1).max(120),
    partyRef: boundedText,
    transportProfile: transportProfile.nullish(),
    transportRef: boundedText.nullish(),
    evidenceArtifactId: boundedId.nullish(),
    successorRelianceId: boundedId.nullish(),
    detailDigest: digest.nullish(),
    observedAt: timestamp,
    idempotencyKey: z.string().min(8).max(500),
    metadata,
  })
  .strict();

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-reliance-signals@1.0.0',
    issuer: 'noeone',
  } as const;
}

export async function relianceSignalRoutes(app: FastifyInstance) {
  app.post('/v1/reliance-assessments/:assessmentId/signals', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ assessmentId: boundedId }).parse(request.params);
    const input = emitSchema.parse(request.body);
    const result = await emitRelianceSignal(
      {
        assessmentId: params.assessmentId,
        ...(input.emittedAt ? { emittedAt: new Date(input.emittedAt) } : {}),
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.reliance-signal.persisted.v1',
      replayed: result.replayed,
      signal: result.signal,
    });
  });

  app.post('/v1/reliance-signals/:signalId/receipts', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ signalId: boundedId }).parse(request.params);
    const input = receiptSchema.parse(request.body);
    const result = await recordRelianceSignalReceipt(
      {
        signalId: params.signalId,
        kind: input.kind,
        partyType: input.partyType,
        partyRef: input.partyRef,
        transportProfile: input.transportProfile ?? null,
        transportRef: input.transportRef ?? null,
        evidenceArtifactId: input.evidenceArtifactId ?? null,
        successorRelianceId: input.successorRelianceId ?? null,
        detailDigest: input.detailDigest ?? null,
        observedAt: new Date(input.observedAt),
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.reliance-signal-receipt.persisted.v1',
      replayed: result.replayed,
      receipt: result.receipt,
    });
  });

  app.get('/v1/actors/:actorId/reliance-signals', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    return {
      version: 'noeone.reliance-signal-list.v1',
      data: await getRelianceSignals(params.actorId, query.limit),
    };
  });

  app.get('/v1/reliance-signals/:signalId/receipts', async (request) => {
    assertAdmin(request);
    const params = z.object({ signalId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    return {
      version: 'noeone.reliance-signal-receipt-list.v1',
      data: await getRelianceSignalReceipts(params.signalId, query.limit),
    };
  });

  app.get('/v1/actors/:actorId/reliance-blast-radius', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    return getActorRelianceBlastRadius(params.actorId);
  });

  app.get('/v1/actors/:actorId/reliance-signals/verify', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    return verifyRelianceSignalProvenance(params.actorId);
  });
}
