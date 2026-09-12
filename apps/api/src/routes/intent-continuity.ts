import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  db,
  registerIntentAssessment,
  registerIntentMandate,
  registerIntentTransform,
  verifyAuthorityIntentChain,
  type IntentAssessmentDisposition,
  type Prisma,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const digestSchema = z.string().min(16).max(512);

const mandateSchema = z.object({
  actorId: z.string().min(1),
  issuer: z.string().min(1).max(240),
  framework: z.string().min(1).max(120),
  principalType: z.string().min(1).max(120),
  principalRef: z.string().min(1).max(500),
  intentDigest: digestSchema,
  digestAlgorithm: z.string().min(1).max(40).default('sha256'),
  externalId: z.string().max(500).optional(),
  uri: z.string().url().max(2_000).optional(),
  issuedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  purposeClass: z.string().max(160).optional(),
  contextDigest: digestSchema.optional(),
  publicMetadata: z.record(z.string(), z.unknown()).default({}),
});

const transformSchema = z.object({
  actorId: z.string().min(1),
  issuer: z.string().min(1).max(240),
  framework: z.string().min(1).max(120),
  parentArtifactId: z.string().min(1),
  inputDigest: digestSchema,
  outputDigest: digestSchema,
  processorType: z.string().min(1).max(120),
  processorRef: z.string().min(1).max(500),
  deterministic: z.boolean(),
  executionId: z.string().min(1).optional(),
  ruleId: z.string().max(240).optional(),
  externalId: z.string().max(500).optional(),
  uri: z.string().url().max(2_000).optional(),
  transformedAt: z.coerce.date().optional(),
  publicMetadata: z.record(z.string(), z.unknown()).default({}),
});

const assessmentSchema = z.object({
  actorId: z.string().min(1),
  issuer: z.string().min(1).max(240),
  mandateArtifactId: z.string().min(1),
  terminalArtifactId: z.string().min(1),
  authorityExerciseId: z.string().min(1),
  disposition: z.enum(['aligned', 'not_aligned', 'indeterminate', 'disputed']),
  evaluator: z.string().min(1).max(240),
  method: z.string().min(1).max(160),
  methodVersion: z.string().min(1).max(120),
  basisDigest: digestSchema,
  confidenceBps: z.number().int().min(0).max(10_000).optional(),
  evidenceArtifactIds: z.array(z.string().min(1)).max(100).default([]),
  assessedAt: z.coerce.date().optional(),
  externalId: z.string().max(500).optional(),
  uri: z.string().url().max(2_000).optional(),
  publicMetadata: z.record(z.string(), z.unknown()).default({}),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-intent-continuity@1.0.0',
    issuer: 'noeone',
  } as const;
}

function disposition(value: 'aligned' | 'not_aligned' | 'indeterminate' | 'disputed') {
  return value.toUpperCase() as IntentAssessmentDisposition;
}

function metadataObject(metadata: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, Prisma.JsonValue>)
    : {};
}

function publicIntentMetadata(kind: string, metadata: Prisma.JsonValue) {
  const value = metadataObject(metadata);
  if (kind === 'noeone.intent.mandate.v1') {
    return {
      version: value.version ?? null,
      framework: value.framework ?? null,
      principalType: value.principalType ?? null,
      intentDigest: value.intentDigest ?? null,
      digestAlgorithm: value.digestAlgorithm ?? null,
      issuedAt: value.issuedAt ?? null,
      expiresAt: value.expiresAt ?? null,
      purposeClass: value.purposeClass ?? null,
      contextDigest: value.contextDigest ?? null,
    };
  }
  if (kind === 'noeone.intent.transform.v1') {
    return {
      version: value.version ?? null,
      framework: value.framework ?? null,
      parentArtifactId: value.parentArtifactId ?? null,
      inputDigest: value.inputDigest ?? null,
      outputDigest: value.outputDigest ?? null,
      processorType: value.processorType ?? null,
      deterministic: value.deterministic ?? null,
      ruleId: value.ruleId ?? null,
      transformedAt: value.transformedAt ?? null,
    };
  }
  if (kind === 'noeone.intent.assessment.v1') {
    return {
      version: value.version ?? null,
      mandateArtifactId: value.mandateArtifactId ?? null,
      terminalArtifactId: value.terminalArtifactId ?? null,
      authorityExerciseId: value.authorityExerciseId ?? null,
      disposition: value.disposition ?? null,
      evaluator: value.evaluator ?? null,
      method: value.method ?? null,
      methodVersion: value.methodVersion ?? null,
      basisDigest: value.basisDigest ?? null,
      confidenceBps: value.confidenceBps ?? null,
      assessedAt: value.assessedAt ?? null,
    };
  }
  return {};
}

export async function intentContinuityRoutes(app: FastifyInstance) {
  app.post('/v1/intent/mandates', async (request, reply) => {
    assertAdmin(request);
    const input = mandateSchema.parse(request.body);
    const result = await registerIntentMandate(
      {
        actorId: input.actorId,
        issuer: input.issuer,
        framework: input.framework,
        principalType: input.principalType,
        principalRef: input.principalRef,
        intentDigest: input.intentDigest,
        digestAlgorithm: input.digestAlgorithm,
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
        ...(input.uri !== undefined ? { uri: input.uri } : {}),
        ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.purposeClass !== undefined ? { purposeClass: input.purposeClass } : {}),
        ...(input.contextDigest !== undefined ? { contextDigest: input.contextDigest } : {}),
        publicMetadata: input.publicMetadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/intent/transforms', async (request, reply) => {
    assertAdmin(request);
    const input = transformSchema.parse(request.body);
    const result = await registerIntentTransform(
      {
        actorId: input.actorId,
        issuer: input.issuer,
        framework: input.framework,
        parentArtifactId: input.parentArtifactId,
        inputDigest: input.inputDigest,
        outputDigest: input.outputDigest,
        processorType: input.processorType,
        processorRef: input.processorRef,
        deterministic: input.deterministic,
        ...(input.executionId !== undefined ? { executionId: input.executionId } : {}),
        ...(input.ruleId !== undefined ? { ruleId: input.ruleId } : {}),
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
        ...(input.uri !== undefined ? { uri: input.uri } : {}),
        ...(input.transformedAt !== undefined ? { transformedAt: input.transformedAt } : {}),
        publicMetadata: input.publicMetadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/intent/assessments', async (request, reply) => {
    assertAdmin(request);
    const input = assessmentSchema.parse(request.body);
    const result = await registerIntentAssessment(
      {
        actorId: input.actorId,
        issuer: input.issuer,
        mandateArtifactId: input.mandateArtifactId,
        terminalArtifactId: input.terminalArtifactId,
        authorityExerciseId: input.authorityExerciseId,
        disposition: disposition(input.disposition),
        evaluator: input.evaluator,
        method: input.method,
        methodVersion: input.methodVersion,
        basisDigest: input.basisDigest,
        ...(input.confidenceBps !== undefined ? { confidenceBps: input.confidenceBps } : {}),
        evidenceArtifactIds: input.evidenceArtifactIds,
        ...(input.assessedAt !== undefined ? { assessedAt: input.assessedAt } : {}),
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
        ...(input.uri !== undefined ? { uri: input.uri } : {}),
        publicMetadata: input.publicMetadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/authority/grants/:grantId/intent/verify', async (request) => {
    const params = z.object({ grantId: z.string().min(1) }).parse(request.params);
    return verifyAuthorityIntentChain(params.grantId);
  });

  app.get('/v1/actors/:handle/intent', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = listSchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true, handle: true, displayName: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    const bindings = await db.actorEvidenceBinding.findMany({
      where: {
        actorId: actor.id,
        role: { in: ['intent_mandate', 'intent_transform', 'intent_assessment'] },
      },
      orderBy: [{ boundAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        role: true,
        boundAt: true,
        artifact: {
          select: {
            id: true,
            kind: true,
            issuer: true,
            digest: true,
            digestAlgorithm: true,
            observedAt: true,
            metadata: true,
          },
        },
      },
    });

    const counts = await db.actorEvidenceBinding.groupBy({
      by: ['role'],
      where: {
        actorId: actor.id,
        role: { in: ['intent_mandate', 'intent_transform', 'intent_assessment'] },
      },
      _count: { _all: true },
    });

    const roleCounts = Object.fromEntries(counts.map((row) => [row.role, row._count._all]));

    return {
      version: 'noeone.intent.public.v1',
      actor,
      summary: {
        mandateCount: roleCounts.intent_mandate ?? 0,
        transformCount: roleCounts.intent_transform ?? 0,
        assessmentCount: roleCounts.intent_assessment ?? 0,
      },
      data: bindings.map((binding) => ({
        id: binding.id,
        role: binding.role,
        boundAt: binding.boundAt,
        artifact: {
          id: binding.artifact.id,
          kind: binding.artifact.kind,
          issuer: binding.artifact.issuer,
          digest: binding.artifact.digest,
          digestAlgorithm: binding.artifact.digestAlgorithm,
          observedAt: binding.artifact.observedAt,
          metadata: publicIntentMetadata(binding.artifact.kind, binding.artifact.metadata),
        },
      })),
    };
  });
}
