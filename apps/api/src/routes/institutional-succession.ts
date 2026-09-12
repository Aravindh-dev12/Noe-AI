import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  activateInstitutionalSuccession,
  addInstitutionalSuccessionItem,
  createInstitutionalSuccessionAgreement,
  db,
  getActorInstitutionalSuccessionSummary,
  getInstitutionalSuccessionAgreement,
  recordInstitutionalSuccessionConsent,
  verifyInstitutionalSuccession,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const idempotencySchema = z.string().min(8).max(500);

const partySchema = z.object({
  role: z.enum(['PREDECESSOR', 'SUCCESSOR', 'COUNTERPARTY', 'AUTHORITY_ISSUER', 'ADJUDICATOR']),
  principalType: z.string().min(1).max(120),
  principalRef: z.string().min(1).max(500),
  required: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const agreementSchema = z.object({
  predecessorActorId: z.string().min(1),
  successorActorId: z.string().min(1),
  successionKind: z.enum(['NOVATION', 'ASSIGNMENT', 'REAUTHORIZATION', 'MIXED']),
  context: z.string().min(1).max(240),
  policyFramework: z.string().max(240).nullable().optional(),
  policyVersion: z.string().min(1).max(120),
  legalContextSnapshotId: z.string().min(1).nullable().optional(),
  sourceEvidenceArtifactId: z.string().min(1),
  recognitionAssessmentId: z.string().min(1).nullable().optional(),
  proposedAt: z.coerce.date().optional(),
  parties: z.array(partySchema).min(2).max(64),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const consentSchema = z.object({
  partyId: z.string().min(1),
  disposition: z.enum(['CONSENTED', 'CONDITIONAL', 'REJECTED']),
  evidenceArtifactId: z.string().min(1),
  method: z.string().min(1).max(240),
  methodVersion: z.string().min(1).max(120),
  assessedAt: z.coerce.date().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  conditions: z.array(z.string().min(1).max(1_000)).max(64).optional(),
  reasons: z.array(z.string().min(1).max(1_000)).max(64).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const itemSchema = z.object({
  itemType: z.enum(['DEBTOR_NOVATION', 'CREDITOR_ASSIGNMENT', 'AUTHORITY_REISSUANCE']),
  sourceCommitmentId: z.string().min(1).nullable().optional(),
  sourceAuthorityGrantId: z.string().min(1).nullable().optional(),
  requestedAuthorityGrantId: z.string().min(1).nullable().optional(),
  predecessorLiabilityMode: z
    .enum(['RELEASED', 'RETAINED_SECONDARY', 'GUARANTOR', 'NOT_APPLICABLE'])
    .optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const activateSchema = z.object({ effectiveAt: z.coerce.date().optional() });
const agreementParams = z.object({ agreementId: z.string().min(1) });
const actorParams = z.object({ handle: z.string().min(1) });

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-institutional-succession@1.0.0',
    issuer: 'noeone',
  } as const;
}

async function actorIdForHandle(handleValue: string): Promise<string | null> {
  const actor = await db.actor.findUnique({
    where: { handle: normalizeHandle(handleValue) },
    select: { id: true },
  });
  return actor?.id ?? null;
}

export async function institutionalSuccessionRoutes(app: FastifyInstance) {
  app.post('/v1/succession/agreements', async (request, reply) => {
    assertAdmin(request);
    const input = agreementSchema.parse(request.body);
    const result = await createInstitutionalSuccessionAgreement({
      predecessorActorId: input.predecessorActorId,
      successorActorId: input.successorActorId,
      successionKind: input.successionKind,
      context: input.context,
      policyFramework: input.policyFramework ?? null,
      policyVersion: input.policyVersion,
      legalContextSnapshotId: input.legalContextSnapshotId ?? null,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      recognitionAssessmentId: input.recognitionAssessmentId ?? null,
      parties: input.parties,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      ...(input.proposedAt ? { proposedAt: input.proposedAt } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/succession/:agreementId/consents', async (request, reply) => {
    assertAdmin(request);
    const params = agreementParams.parse(request.params);
    const input = consentSchema.parse(request.body);
    const result = await recordInstitutionalSuccessionConsent({
      agreementId: params.agreementId,
      partyId: input.partyId,
      disposition: input.disposition,
      evidenceArtifactId: input.evidenceArtifactId,
      method: input.method,
      methodVersion: input.methodVersion,
      conditions: input.conditions ?? [],
      reasons: input.reasons ?? [],
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      ...(input.assessedAt ? { assessedAt: input.assessedAt } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/succession/:agreementId/items', async (request, reply) => {
    assertAdmin(request);
    const params = agreementParams.parse(request.params);
    const input = itemSchema.parse(request.body);
    const result = await addInstitutionalSuccessionItem({
      agreementId: params.agreementId,
      itemType: input.itemType,
      sourceCommitmentId: input.sourceCommitmentId ?? null,
      sourceAuthorityGrantId: input.sourceAuthorityGrantId ?? null,
      requestedAuthorityGrantId: input.requestedAuthorityGrantId ?? null,
      ...(input.predecessorLiabilityMode
        ? { predecessorLiabilityMode: input.predecessorLiabilityMode }
        : {}),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/succession/:agreementId/activate', async (request, reply) => {
    assertAdmin(request);
    const params = agreementParams.parse(request.params);
    const input = activateSchema.parse(request.body ?? {});
    const result = await activateInstitutionalSuccession(
      params.agreementId,
      registryContext(),
      input.effectiveAt ?? new Date(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/succession/:agreementId', async (request) => {
    assertAdmin(request);
    const params = agreementParams.parse(request.params);
    return getInstitutionalSuccessionAgreement(params.agreementId);
  });

  app.get('/v1/actors/:handle/succession', async (request, reply) => {
    const params = actorParams.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });
    return getActorInstitutionalSuccessionSummary(actorId);
  });

  app.get('/v1/actors/:handle/succession/verify', async (request, reply) => {
    const params = actorParams.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });
    const verification = await verifyInstitutionalSuccession(actorId);
    return reply.code(verification.verified ? 200 : 409).send(verification);
  });
}