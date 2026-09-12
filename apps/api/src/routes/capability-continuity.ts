import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  db,
  getActorCapabilityContinuitySummary,
  getAuthorityAdmissibilityState,
  recordAuthorityAdmissibilityAssessment,
  registerExecutionCapabilityManifest,
  verifyCapabilityContinuity,
  type Prisma,
} from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';

const idempotencySchema = z.string().min(8).max(240);
const metadataSchema = z.record(z.string(), z.unknown()).default({});

const manifestSchema = z.object({
  actorId: z.string().min(1),
  executionId: z.string().min(1),
  framework: z.string().min(1).max(120),
  frameworkVersion: z.string().min(1).max(120).optional(),
  issuer: z.string().min(1).max(500),
  externalReference: z.string().min(1).max(1_000).optional(),
  sourceEvidenceArtifactId: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1).max(240)).max(512).default([]),
  tools: z.array(z.string().min(1).max(240)).max(512).default([]),
  modelRef: z.string().min(1).max(500).optional(),
  runtimeRef: z.string().min(1).max(500).optional(),
  effectiveAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const assessmentSchema = z.object({
  grantId: z.string().min(1),
  executionId: z.string().min(1),
  capabilityManifestId: z.string().min(1).optional(),
  disposition: z.enum([
    'ADMISSIBLE',
    'REVIEW_REQUIRED',
    'SUSPENDED',
    'NOT_APPLICABLE',
    'DISPUTED',
  ]),
  evaluator: z.string().min(1).max(500),
  method: z.string().min(1).max(240),
  methodVersion: z.string().min(1).max(120),
  sourceEvidenceArtifactId: z.string().min(1).optional(),
  assessedAt: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  reasons: z.array(z.string().min(1).max(1_000)).max(32).default([]),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const stateQuerySchema = z.object({
  executionId: z.string().min(1).optional(),
  at: z.coerce.date().optional(),
});

const summaryQuerySchema = z.object({ at: z.coerce.date().optional() });

export async function capabilityContinuityRoutes(app: FastifyInstance) {
  // Writes are privileged because these records are institutional evidence,
  // not claims an untrusted agent may self-assert as authoritative.
  app.post('/v1/capability/manifests', async (request, reply) => {
    assertAdmin(request);
    const input = manifestSchema.parse(request.body);
    const result = await registerExecutionCapabilityManifest({
      actorId: input.actorId,
      executionId: input.executionId,
      framework: input.framework,
      issuer: input.issuer,
      capabilities: input.capabilities,
      tools: input.tools,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata as Prisma.InputJsonObject,
      ...(input.frameworkVersion !== undefined ? { frameworkVersion: input.frameworkVersion } : {}),
      ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
      ...(input.sourceEvidenceArtifactId !== undefined
        ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
        : {}),
      ...(input.modelRef !== undefined ? { modelRef: input.modelRef } : {}),
      ...(input.runtimeRef !== undefined ? { runtimeRef: input.runtimeRef } : {}),
      ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/authority/admissibility-assessments', async (request, reply) => {
    assertAdmin(request);
    const input = assessmentSchema.parse(request.body);
    const result = await recordAuthorityAdmissibilityAssessment({
      grantId: input.grantId,
      executionId: input.executionId,
      disposition: input.disposition,
      evaluator: input.evaluator,
      method: input.method,
      methodVersion: input.methodVersion,
      reasons: input.reasons,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata as Prisma.InputJsonObject,
      ...(input.capabilityManifestId !== undefined
        ? { capabilityManifestId: input.capabilityManifestId }
        : {}),
      ...(input.sourceEvidenceArtifactId !== undefined
        ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
        : {}),
      ...(input.assessedAt !== undefined ? { assessedAt: input.assessedAt } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/authority/grants/:grantId/admissibility', async (request, reply) => {
    const params = z.object({ grantId: z.string().min(1) }).parse(request.params);
    const query = stateQuerySchema.parse(request.query);
    let executionId = query.executionId;
    if (!executionId) {
      const grant = await db.authorityGrant.findUnique({
        where: { id: params.grantId },
        select: { subjectActorId: true },
      });
      if (!grant) return reply.code(404).send({ error: 'authority_grant_not_found' });
      const current = await db.actorExecution.findFirst({
        where: { subject: undefined },
      }).catch(() => null);
      // Prisma cannot express the raw-table capability records, but the actor
      // execution itself is modeled. Resolve current execution explicitly.
      void current;
      const executions = await db.actorExecution.findMany({
        where: { actorId: grant.subjectActorId, endedAt: null },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true },
      });
      executionId = executions[0]?.id;
      if (!executionId) return reply.code(409).send({ error: 'actor_has_no_current_execution' });
    }
    return getAuthorityAdmissibilityState(params.grantId, executionId, query.at ?? new Date());
  });

  app.get('/v1/actors/:handle/capability-continuity', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = summaryQuerySchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return getActorCapabilityContinuitySummary(actor.id, query.at ?? new Date());
  });

  app.get('/v1/actors/:handle/capability-continuity/verify', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return verifyCapabilityContinuity(actor.id);
  });
}
