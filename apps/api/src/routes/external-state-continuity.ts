import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  db,
  getExternalStateContinuationSummary,
  recordExternalStateContinuationDecision,
  verifyExternalStateContinuation,
} from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';

const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const decisionSchema = z
  .object({
    actorId: z.string().min(1),
    continuityTransitionId: z.string().min(1).nullable().optional(),
    ancestryId: z.string().min(1).nullable().optional(),
    stateClass: z.enum(['RELATIONSHIP', 'INSTITUTIONAL_STATUS', 'DEONTIC', 'AUDIENCE']),
    sourceStateType: z.string().min(1).max(120),
    sourceStateRef: z.string().min(1).max(500),
    sourceStateDigest: sha256Schema,
    externalPrincipalType: z.string().min(1).max(120),
    externalPrincipalRef: z.string().min(1).max(500),
    context: z.string().min(1).max(240),
    disposition: z.enum([
      'CONTINUED',
      'CONDITIONAL',
      'REISSUED',
      'REJECTED',
      'TERMINATED',
      'DISPUTED',
    ]),
    successorStateRef: z.string().min(1).max(500).nullable().optional(),
    policyFramework: z.string().max(240).nullable().optional(),
    policyVersion: z.string().min(1).max(120),
    sourceEvidenceArtifactId: z.string().min(1).nullable().optional(),
    decidedAt: z.coerce.date().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    conditions: z.array(z.string().min(1).max(1_000)).max(64).optional(),
    reasons: z.array(z.string().min(1).max(1_000)).max(64).optional(),
    idempotencyKey: z.string().min(1).max(500),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    const targetCount =
      Number(Boolean(value.continuityTransitionId)) + Number(Boolean(value.ancestryId));
    if (targetCount !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Exactly one of continuityTransitionId or ancestryId is required.',
        path: ['continuityTransitionId'],
      });
    }
    if (value.disposition === 'REISSUED' && !value.successorStateRef) {
      context.addIssue({
        code: 'custom',
        message: 'successorStateRef is required when disposition is REISSUED.',
        path: ['successorStateRef'],
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

export async function externalStateContinuityRoutes(app: FastifyInstance) {
  app.post('/v1/external-state-continuations', async (request, reply) => {
    assertAdmin(request);
    const input = decisionSchema.parse(request.body);
    const result = await recordExternalStateContinuationDecision({
      actorId: input.actorId,
      continuityTransitionId: input.continuityTransitionId ?? null,
      ancestryId: input.ancestryId ?? null,
      stateClass: input.stateClass,
      sourceStateType: input.sourceStateType,
      sourceStateRef: input.sourceStateRef,
      sourceStateDigest: input.sourceStateDigest,
      externalPrincipalType: input.externalPrincipalType,
      externalPrincipalRef: input.externalPrincipalRef,
      context: input.context,
      disposition: input.disposition,
      successorStateRef: input.successorStateRef ?? null,
      policyFramework: input.policyFramework ?? null,
      policyVersion: input.policyVersion,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
      conditions: input.conditions ?? [],
      reasons: input.reasons ?? [],
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      ...(input.decidedAt ? { decidedAt: input.decidedAt } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/actors/:handle/external-state', async (request, reply) => {
    const params = handleSchema.parse(request.params);
    const query = summaryQuerySchema.parse(request.query);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });

    return getExternalStateContinuationSummary(actorId, query.at ?? new Date());
  });

  app.get('/v1/actors/:handle/external-state/verify', async (request, reply) => {
    const params = handleSchema.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });

    const verification = await verifyExternalStateContinuation(actorId);
    return reply.code(verification.verified ? 200 : 409).send(verification);
  });
}
