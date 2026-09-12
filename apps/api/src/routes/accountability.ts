import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  db,
  recordAuthorityExercise,
  recordConsequenceAttribution,
  recordConsequenceObservation,
  verifyAuthorityExercise,
  verifyConsequenceState,
  type Prisma,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const idempotencySchema = z.string().min(8).max(240);
const moneySchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(80);

const exerciseSchema = z.object({
  actorId: z.string().min(1),
  executionId: z.string().min(1).optional(),
  grantId: z.string().min(1),
  evidenceArtifactId: z.string().min(1),
  action: z.string().min(1).max(240),
  resource: z.string().min(1).max(500),
  amountMinor: moneySchema.optional(),
  currency: z.string().length(3).optional(),
  exercisedAt: z.coerce.date(),
  evaluatorVersion: z.string().min(1).max(120).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const observationSchema = z.object({
  kind: z.string().min(1).max(160),
  sourceEvidenceArtifactId: z.string().min(1),
  sourceAuthorityExerciseId: z.string().min(1).optional(),
  commitmentId: z.string().min(1).optional(),
  occurredAt: z.coerce.date(),
  valueMinor: moneySchema.optional(),
  currency: z.string().length(3).optional(),
  externalFramework: z.string().min(1).max(120).optional(),
  externalReference: z.string().min(1).max(500).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const attributionSchema = z.object({
  consequenceId: z.string().min(1),
  actorId: z.string().min(1),
  assessmentType: z.string().min(1).max(120),
  disposition: z.enum(['SUPPORTED', 'NOT_SUPPORTED', 'INDETERMINATE', 'DISPUTED']),
  method: z.string().min(1).max(160),
  methodVersion: z.string().min(1).max(120),
  evaluator: z.string().min(1).max(300),
  scoreBps: z.number().int().min(0).max(10_000).optional(),
  sourceEvidenceArtifactId: z.string().min(1).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-accountability@1.0.0',
    issuer: 'noeone',
  } as const;
}

export async function accountabilityRoutes(app: FastifyInstance) {
  app.post('/v1/authority/exercises', async (request, reply) => {
    assertAdmin(request);
    const input = exerciseSchema.parse(request.body);
    const result = await recordAuthorityExercise(
      {
        actorId: input.actorId,
        grantId: input.grantId,
        evidenceArtifactId: input.evidenceArtifactId,
        action: input.action,
        resource: input.resource,
        exercisedAt: input.exercisedAt,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonObject,
        ...(input.executionId !== undefined ? { executionId: input.executionId } : {}),
        ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
        ...(input.evaluatorVersion !== undefined
          ? { evaluatorVersion: input.evaluatorVersion }
          : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/authority/exercises/:exerciseId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ exerciseId: z.string().min(1) }).parse(request.params);
    const exercise = await db.authorityExercise.findUnique({
      where: { id: params.exerciseId },
      include: {
        actor: { select: { id: true, handle: true, displayName: true } },
        execution: { select: { id: true, provider: true, model: true, runtime: true } },
        grant: {
          select: { id: true, parentGrantId: true, grantorType: true, grantorRef: true },
        },
        evidence: {
          select: { id: true, kind: true, issuer: true, digest: true, digestAlgorithm: true },
        },
      },
    });
    if (!exercise) return reply.code(404).send({ error: 'authority_exercise_not_found' });
    return exercise;
  });

  app.get('/v1/authority/exercises/:exerciseId/verify', async (request) => {
    assertAdmin(request);
    const params = z.object({ exerciseId: z.string().min(1) }).parse(request.params);
    return verifyAuthorityExercise(params.exerciseId);
  });

  app.post('/v1/consequences/observations', async (request, reply) => {
    assertAdmin(request);
    const input = observationSchema.parse(request.body);
    const result = await recordConsequenceObservation({
      kind: input.kind,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      occurredAt: input.occurredAt,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata as Prisma.InputJsonObject,
      ...(input.sourceAuthorityExerciseId !== undefined
        ? { sourceAuthorityExerciseId: input.sourceAuthorityExerciseId }
        : {}),
      ...(input.commitmentId !== undefined ? { commitmentId: input.commitmentId } : {}),
      ...(input.valueMinor !== undefined ? { valueMinor: input.valueMinor } : {}),
      ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
      ...(input.externalFramework !== undefined
        ? { externalFramework: input.externalFramework }
        : {}),
      ...(input.externalReference !== undefined
        ? { externalReference: input.externalReference }
        : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/consequences/attributions', async (request, reply) => {
    assertAdmin(request);
    const input = attributionSchema.parse(request.body);
    const result = await recordConsequenceAttribution(
      {
        consequenceId: input.consequenceId,
        actorId: input.actorId,
        assessmentType: input.assessmentType,
        disposition: input.disposition,
        method: input.method,
        methodVersion: input.methodVersion,
        evaluator: input.evaluator,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonObject,
        ...(input.scoreBps !== undefined ? { scoreBps: input.scoreBps } : {}),
        ...(input.sourceEvidenceArtifactId !== undefined
          ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
          : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/consequences/:consequenceId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ consequenceId: z.string().min(1) }).parse(request.params);
    const observation = await db.consequenceObservation.findUnique({
      where: { id: params.consequenceId },
      include: {
        sourceEvidence: {
          select: { id: true, kind: true, issuer: true, digest: true, digestAlgorithm: true },
        },
        sourceAuthorityExercise: {
          select: {
            id: true,
            actorId: true,
            grantId: true,
            coverageStatus: true,
            exercisedAt: true,
            chainDigest: true,
            requestDigest: true,
          },
        },
        commitment: { select: { id: true, kind: true, status: true } },
        attributions: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { actor: { select: { id: true, handle: true, displayName: true } } },
        },
      },
    });
    if (!observation) return reply.code(404).send({ error: 'consequence_not_found' });
    return observation;
  });

  app.get('/v1/actors/:handle/consequences', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = listSchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true, handle: true, displayName: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    const attributions = await db.consequenceAttribution.findMany({
      where: { actorId: actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        consequenceId: true,
        assessmentType: true,
        disposition: true,
        method: true,
        methodVersion: true,
        evaluator: true,
        scoreBps: true,
        basisDigest: true,
        createdAt: true,
        consequence: {
          select: { id: true, kind: true, occurredAt: true, externalFramework: true },
        },
      },
    });

    return {
      version: 'noeone.consequence.public.v1',
      actor,
      data: attributions.map((attribution) => ({
        ...attribution,
        disposition: attribution.disposition.toLowerCase(),
      })),
    };
  });

  app.get('/v1/actors/:handle/consequences/verify', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return verifyConsequenceState(actor.id);
  });
}
