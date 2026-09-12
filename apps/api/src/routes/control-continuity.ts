import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  createActorControlPolicy,
  db,
  finalizeActorControlTransition,
  getActorControlFull,
  getActorControlSummaryByHandle,
  initializeActorControlEpoch,
  Prisma,
  proposeActorControlTransition,
  recordActorControlApproval,
  type ActorControlTransitionRow,
  verifyActorControlHistory,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const metadataSchema = z.record(z.string(), z.unknown()).default({});
const evidenceIdSchema = z.string().min(1).max(240);
const idempotencyKeySchema = z.string().min(8).max(240);
const principalTypeSchema = z.string().min(1).max(120);
const principalRefSchema = z.string().min(1).max(500);

const policySchema = z.object({
  actorId: z.string().min(1),
  threshold: z.number().int().min(1).max(32),
  challengeWindowSeconds: z.number().int().min(0).max(2_592_000).optional(),
  guardians: z
    .array(
      z.object({
        principalType: principalTypeSchema,
        principalRef: principalRefSchema,
        role: z.string().min(1).max(120).optional(),
      }),
    )
    .min(1)
    .max(32),
  sourceEvidenceArtifactId: evidenceIdSchema.optional(),
  externalFramework: z.string().min(1).max(120).optional(),
  externalReference: z.string().min(1).max(1000).optional(),
  effectiveAt: z.coerce.date().optional(),
  idempotencyKey: idempotencyKeySchema,
  metadata: metadataSchema,
});

const initializeEpochSchema = z.object({
  actorId: z.string().min(1),
  policyId: z.string().min(1),
  controllerType: principalTypeSchema,
  controllerRef: principalRefSchema,
  keyStateDigest: z.string().min(1).max(500).optional(),
  sourceEvidenceArtifactId: evidenceIdSchema.optional(),
  externalFramework: z.string().min(1).max(120).optional(),
  externalReference: z.string().min(1).max(1000).optional(),
  startedAt: z.coerce.date().optional(),
  idempotencyKey: idempotencyKeySchema,
  metadata: metadataSchema,
});

const transitionKindSchema = z.enum([
  'ROTATION',
  'TRANSFER',
  'RECOVERY',
  'QUARANTINE',
  'RESTORE',
]);

const transitionSchema = z.object({
  actorId: z.string().min(1),
  kind: transitionKindSchema,
  sourceEvidenceArtifactId: evidenceIdSchema,
  proposedControllerType: principalTypeSchema.optional(),
  proposedControllerRef: principalRefSchema.optional(),
  proposedKeyStateDigest: z.string().min(1).max(500).optional(),
  proposedAt: z.coerce.date().optional(),
  idempotencyKey: idempotencyKeySchema,
  metadata: metadataSchema,
});

const approvalSchema = z.object({
  principalType: principalTypeSchema,
  principalRef: principalRefSchema,
  disposition: z.enum(['APPROVE', 'OBJECT']),
  sourceEvidenceArtifactId: evidenceIdSchema,
  observedAt: z.coerce.date().optional(),
  idempotencyKey: idempotencyKeySchema,
  metadata: metadataSchema,
});

const transitionParamsSchema = z.object({ transitionId: z.string().min(1) });
const handleParamsSchema = z.object({ handle: z.string().min(1) });
const finalizeSchema = z.object({ decidedAt: z.coerce.date().optional() });

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-control@1.0.0',
    issuer: 'noeone',
  } as const;
}

async function actorIdFromHandle(rawHandle: string): Promise<string> {
  const handle = normalizeHandle(rawHandle);
  const actor = await db.actor.findUnique({ where: { handle }, select: { id: true } });
  if (!actor) {
    throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  }
  return actor.id;
}

export async function controlContinuityRoutes(app: FastifyInstance) {
  // Recovery/controller evidence can expose account-security and governance
  // details. Writes and the full graph remain privileged in v1.
  app.post('/v1/control/policies', async (request, reply) => {
    assertAdmin(request);
    const input = policySchema.parse(request.body);
    const result = await createActorControlPolicy(
      {
        actorId: input.actorId,
        threshold: input.threshold,
        guardians: input.guardians,
        ...(input.challengeWindowSeconds !== undefined
          ? { challengeWindowSeconds: input.challengeWindowSeconds }
          : {}),
        ...(input.sourceEvidenceArtifactId !== undefined
          ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
          : {}),
        ...(input.externalFramework !== undefined
          ? { externalFramework: input.externalFramework }
          : {}),
        ...(input.externalReference !== undefined
          ? { externalReference: input.externalReference }
          : {}),
        ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/control/epochs', async (request, reply) => {
    assertAdmin(request);
    const input = initializeEpochSchema.parse(request.body);
    const result = await initializeActorControlEpoch(
      {
        actorId: input.actorId,
        policyId: input.policyId,
        controllerType: input.controllerType,
        controllerRef: input.controllerRef,
        ...(input.keyStateDigest !== undefined ? { keyStateDigest: input.keyStateDigest } : {}),
        ...(input.sourceEvidenceArtifactId !== undefined
          ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
          : {}),
        ...(input.externalFramework !== undefined
          ? { externalFramework: input.externalFramework }
          : {}),
        ...(input.externalReference !== undefined
          ? { externalReference: input.externalReference }
          : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/control/transitions', async (request, reply) => {
    assertAdmin(request);
    const input = transitionSchema.parse(request.body);
    const result = await proposeActorControlTransition({
      actorId: input.actorId,
      kind: input.kind,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      ...(input.proposedControllerType !== undefined
        ? { proposedControllerType: input.proposedControllerType }
        : {}),
      ...(input.proposedControllerRef !== undefined
        ? { proposedControllerRef: input.proposedControllerRef }
        : {}),
      ...(input.proposedKeyStateDigest !== undefined
        ? { proposedKeyStateDigest: input.proposedKeyStateDigest }
        : {}),
      ...(input.proposedAt !== undefined ? { proposedAt: input.proposedAt } : {}),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/control/transitions/:transitionId/approvals', async (request, reply) => {
    assertAdmin(request);
    const params = transitionParamsSchema.parse(request.params);
    const input = approvalSchema.parse(request.body);
    const result = await recordActorControlApproval({
      transitionId: params.transitionId,
      principalType: input.principalType,
      principalRef: input.principalRef,
      disposition: input.disposition,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/control/transitions/:transitionId/finalize', async (request) => {
    assertAdmin(request);
    const params = transitionParamsSchema.parse(request.params);
    const input = finalizeSchema.parse(request.body ?? {});
    return finalizeActorControlTransition(
      params.transitionId,
      registryContext(),
      input.decidedAt ?? new Date(),
    );
  });

  app.get('/v1/control/transitions/:transitionId', async (request, reply) => {
    assertAdmin(request);
    const params = transitionParamsSchema.parse(request.params);
    const rows = await db.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlTransition" WHERE "id" = ${params.transitionId} LIMIT 1
    `);
    const transition = rows[0];
    if (!transition) return reply.code(404).send({ error: 'control_transition_not_found' });
    return transition;
  });

  app.get('/v1/actors/:handle/control/full', async (request) => {
    assertAdmin(request);
    const params = handleParamsSchema.parse(request.params);
    return getActorControlFull(await actorIdFromHandle(params.handle));
  });

  app.get('/v1/actors/:handle/control', async (request) => {
    const params = handleParamsSchema.parse(request.params);
    return getActorControlSummaryByHandle(normalizeHandle(params.handle));
  });

  app.get('/v1/actors/:handle/control/verify', async (request) => {
    const params = handleParamsSchema.parse(request.params);
    const verification = await verifyActorControlHistory(await actorIdFromHandle(params.handle));
    // Public verification intentionally withholds internal object IDs and
    // diagnostic strings. Operators can inspect the privileged full graph.
    return {
      version: verification.version,
      actorId: verification.actorId,
      valid: verification.valid,
      issueCount: verification.issues.length,
      policyCount: verification.policyCount,
      epochCount: verification.epochCount,
      transitionCount: verification.transitionCount,
      approvalCount: verification.approvalCount,
      currentEpoch: verification.currentEpoch,
      currentState: verification.currentState,
      currentBasisDigest: verification.currentBasisDigest,
    };
  });
}
