import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  createDependencyRelation,
  createDependencySnapshot,
  db,
  getActorDependencyState,
  getDependencyComponent,
  getDependencyExposure,
  recordDependencyIncident,
  registerDependencyComponent,
  verifyActorDependencyState,
} from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';

const idempotencySchema = z.string().min(8).max(240);
const metadataSchema = z.record(z.string(), z.unknown()).default({});

const componentSchema = z.object({
  kind: z.string().min(1).max(120),
  canonicalName: z.string().min(1).max(500),
  provider: z.string().min(1).max(240).optional(),
  version: z.string().min(1).max(240).optional(),
  purl: z.string().min(1).max(2_000).optional(),
  externalFramework: z.string().min(1).max(120).optional(),
  externalReference: z.string().min(1).max(2_000).optional(),
  metadata: metadataSchema,
});

const bindingSchema = z.object({
  componentId: z.string().min(1),
  role: z.string().min(1).max(160),
  direct: z.boolean().default(true),
  required: z.boolean().default(true),
  evidenceArtifactId: z.string().min(1).optional(),
  disclosureClass: z.enum(['private', 'aggregate', 'public']).default('private'),
  metadata: metadataSchema,
});

const snapshotSchema = z.object({
  actorId: z.string().min(1),
  executionId: z.string().min(1),
  framework: z.string().min(1).max(120),
  manifestDigest: z.string().min(16).max(512),
  sourceEvidenceArtifactId: z.string().min(1).optional(),
  effectiveAt: z.coerce.date(),
  idempotencyKey: idempotencySchema,
  dependencies: z.array(bindingSchema).min(1).max(1_000),
  metadata: metadataSchema,
});

const relationSchema = z.object({
  sourceComponentId: z.string().min(1),
  targetComponentId: z.string().min(1),
  relationType: z.string().min(1).max(160),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  sourceEvidenceArtifactId: z.string().min(1).optional(),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const incidentSchema = z.object({
  componentId: z.string().min(1),
  kind: z.string().min(1).max(160),
  status: z.enum(['OBSERVED', 'RESOLVED', 'DISPUTED', 'RETRACTED']).default('OBSERVED'),
  sourceEvidenceArtifactId: z.string().min(1),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
  externalFramework: z.string().min(1).max(120).optional(),
  externalReference: z.string().min(1).max(2_000).optional(),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const exposureQuerySchema = z.object({
  at: z.coerce.date().optional(),
  maxDepth: z.coerce.number().int().min(0).max(16).default(6),
});

const actorQuerySchema = z.object({
  at: z.coerce.date().optional(),
});

export async function dependencyRoutes(app: FastifyInstance) {
  // Full topology is privileged because dependency graphs may expose security-
  // sensitive architecture. Public passport surfaces should publish aggregates only.
  app.post('/v1/dependencies/components', async (request, reply) => {
    assertAdmin(request);
    const input = componentSchema.parse(request.body);
    const result = await registerDependencyComponent({
      kind: input.kind,
      canonicalName: input.canonicalName,
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.purl !== undefined ? { purl: input.purl } : {}),
      ...(input.externalFramework !== undefined
        ? { externalFramework: input.externalFramework }
        : {}),
      ...(input.externalReference !== undefined
        ? { externalReference: input.externalReference }
        : {}),
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/dependencies/snapshots', async (request, reply) => {
    assertAdmin(request);
    const input = snapshotSchema.parse(request.body);
    const result = await createDependencySnapshot({
      actorId: input.actorId,
      executionId: input.executionId,
      framework: input.framework,
      manifestDigest: input.manifestDigest,
      ...(input.sourceEvidenceArtifactId !== undefined
        ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
        : {}),
      effectiveAt: input.effectiveAt,
      idempotencyKey: input.idempotencyKey,
      dependencies: input.dependencies.map((dependency) => ({
        componentId: dependency.componentId,
        role: dependency.role,
        direct: dependency.direct,
        required: dependency.required,
        disclosureClass: dependency.disclosureClass,
        ...(dependency.evidenceArtifactId !== undefined
          ? { evidenceArtifactId: dependency.evidenceArtifactId }
          : {}),
        metadata: dependency.metadata,
      })),
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/dependencies/relations', async (request, reply) => {
    assertAdmin(request);
    const input = relationSchema.parse(request.body);
    const result = await createDependencyRelation({
      sourceComponentId: input.sourceComponentId,
      targetComponentId: input.targetComponentId,
      relationType: input.relationType,
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
      ...(input.sourceEvidenceArtifactId !== undefined
        ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
        : {}),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/dependencies/incidents', async (request, reply) => {
    assertAdmin(request);
    const input = incidentSchema.parse(request.body);
    const result = await recordDependencyIncident({
      componentId: input.componentId,
      kind: input.kind,
      status: input.status,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      startedAt: input.startedAt,
      ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
      ...(input.externalFramework !== undefined
        ? { externalFramework: input.externalFramework }
        : {}),
      ...(input.externalReference !== undefined
        ? { externalReference: input.externalReference }
        : {}),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/dependencies/components/:componentId', async (request) => {
    assertAdmin(request);
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    return getDependencyComponent(params.componentId);
  });

  app.get('/v1/dependencies/components/:componentId/exposure', async (request) => {
    assertAdmin(request);
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const query = exposureQuerySchema.parse(request.query);
    return getDependencyExposure(params.componentId, query.at ?? new Date(), query.maxDepth);
  });

  app.get('/v1/actors/:handle/dependencies', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = actorQuerySchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return getActorDependencyState(actor.id, query.at ?? new Date());
  });

  app.get('/v1/actors/:handle/dependencies/verify', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return verifyActorDependencyState(actor.id);
  });
}
