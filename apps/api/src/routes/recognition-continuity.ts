import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  db,
  getActorRecognitionSummary,
  recordContinuityRecognitionAssessment,
  verifyRecognitionContinuity,
} from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';

const assessmentSchema = z
  .object({
    actorId: z.string().min(1),
    continuityTransitionId: z.string().min(1).nullable().optional(),
    ancestryId: z.string().min(1).nullable().optional(),
    relation: z.enum(['SAME_ACTOR', 'SUCCESSOR', 'DESCENDANT', 'UNRELATED']),
    disposition: z.enum(['RECOGNIZED', 'CONDITIONAL', 'REJECTED', 'DISPUTED']),
    recognizerType: z.string().min(1).max(120),
    recognizerRef: z.string().min(1).max(500),
    context: z.string().min(1).max(240),
    policyFramework: z.string().max(240).nullable().optional(),
    policyVersion: z.string().min(1).max(120),
    sourceEvidenceArtifactId: z.string().min(1).nullable().optional(),
    assessedAt: z.coerce.date().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    conditions: z.array(z.string().min(1).max(1_000)).max(64).optional(),
    reasons: z.array(z.string().min(1).max(1_000)).max(64).optional(),
    idempotencyKey: z.string().min(1).max(500),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    const targetCount = Number(Boolean(value.continuityTransitionId)) + Number(Boolean(value.ancestryId));
    if (targetCount !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Exactly one of continuityTransitionId or ancestryId is required.',
        path: ['continuityTransitionId'],
      });
    }
  });

const handleSchema = z.object({ handle: z.string().min(1) });
const summaryQuerySchema = z.object({ at: z.coerce.date().optional() });

async function actorIdForHandle(handleValue: string): Promise<string | null> {
  const actor = await db.actor.findUnique({
    where: { handle: normalizeHandle(handleValue) },
    select: { id: true },
  });
  return actor?.id ?? null;
}

export async function recognitionContinuityRoutes(app: FastifyInstance) {
  app.post('/v1/recognition-assessments', async (request, reply) => {
    assertAdmin(request);
    const input = assessmentSchema.parse(request.body);
    const result = await recordContinuityRecognitionAssessment({
      actorId: input.actorId,
      continuityTransitionId: input.continuityTransitionId ?? null,
      ancestryId: input.ancestryId ?? null,
      relation: input.relation,
      disposition: input.disposition,
      recognizerType: input.recognizerType,
      recognizerRef: input.recognizerRef,
      context: input.context,
      policyFramework: input.policyFramework ?? null,
      policyVersion: input.policyVersion,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
      conditions: input.conditions ?? [],
      reasons: input.reasons ?? [],
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      ...(input.assessedAt ? { assessedAt: input.assessedAt } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/actors/:handle/recognition', async (request, reply) => {
    const params = handleSchema.parse(request.params);
    const query = summaryQuerySchema.parse(request.query);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });

    return getActorRecognitionSummary(actorId, query.at ?? new Date());
  });

  app.get('/v1/actors/:handle/recognition/verify', async (request, reply) => {
    const params = handleSchema.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });

    const verification = await verifyRecognitionContinuity(actorId);
    return reply.code(verification.verified ? 200 : 409).send(verification);
  });
}
