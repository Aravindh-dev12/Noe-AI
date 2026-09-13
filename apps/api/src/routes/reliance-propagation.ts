import type { FastifyInstance } from 'fastify';
import {
  assessReliancePropagation,
  buildRelianceExposureReport,
  getRelianceDependencies,
  getReliancePropagationAssessments,
  registerRelianceDependency,
  verifyReliancePropagation,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';
import { jsonMetadataSchema } from '../lib/json.js';

const boundedId = z.string().min(1).max(240);
const boundedText = z.string().min(1).max(800);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

const dependencySchema = z
  .object({
    actorId: boundedId,
    downstreamRelianceId: boundedId,
    upstreamRelianceId: boundedId,
    dependencyKind: z.enum(['required', 'material', 'informative', 'fallback']),
    expectedUpstreamBasisDigest: digest,
    expectedDownstreamBasisDigest: digest,
    evidenceArtifactId: boundedId,
    createdByType: z.string().min(1).max(120),
    createdByRef: boundedText,
    idempotencyKey: z.string().min(8).max(500),
    metadata: jsonMetadataSchema,
  })
  .strict();

const assessmentSchema = z
  .object({
    actorId: boundedId,
    downstreamRelianceId: boundedId,
    triggerRelianceId: boundedId,
    triggerAssessmentId: boundedId.nullish(),
    expectedTriggerDigest: digest,
    expectedDependencyDigest: digest,
    expectedDownstreamBasisDigest: digest,
    disposition: z.enum(['unaffected', 'review-required', 'blocked', 'disputed', 'unknown']),
    evaluatorType: z.string().min(1).max(120),
    evaluatorRef: boundedText,
    method: z.string().min(1).max(240),
    methodVersion: z.string().min(1).max(120),
    evidenceArtifactId: boundedId,
    reason: z.string().max(4000).nullish(),
    assessedAt: timestamp,
    idempotencyKey: z.string().min(8).max(500),
    metadata: jsonMetadataSchema,
  })
  .strict();

const listSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
  .strict();

const exposureSchema = z
  .object({
    maxDepth: z.coerce.number().int().min(1).max(32).default(12),
    maxNodes: z.coerce.number().int().min(1).max(1000).default(500),
  })
  .strict();

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-reliance-propagation@1.0.0',
    issuer: 'noeone',
  } as const;
}

export async function reliancePropagationRoutes(app: FastifyInstance) {
  app.post('/v1/reliance-dependencies', async (request, reply) => {
    assertAdmin(request);
    const input = dependencySchema.parse(request.body);
    const result = await registerRelianceDependency(
      {
        actorId: input.actorId,
        downstreamRelianceId: input.downstreamRelianceId,
        upstreamRelianceId: input.upstreamRelianceId,
        dependencyKind: input.dependencyKind,
        expectedUpstreamBasisDigest: input.expectedUpstreamBasisDigest,
        expectedDownstreamBasisDigest: input.expectedDownstreamBasisDigest,
        evidenceArtifactId: input.evidenceArtifactId,
        createdByType: input.createdByType,
        createdByRef: input.createdByRef,
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.reliance-dependency.persisted.v1',
      replayed: result.replayed,
      dependency: result.dependency,
    });
  });

  app.post('/v1/reliance-dependencies/:dependencyId/assessments', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ dependencyId: boundedId }).parse(request.params);
    const input = assessmentSchema.parse(request.body);
    const result = await assessReliancePropagation(
      {
        actorId: input.actorId,
        dependencyId: params.dependencyId,
        downstreamRelianceId: input.downstreamRelianceId,
        triggerRelianceId: input.triggerRelianceId,
        triggerAssessmentId: input.triggerAssessmentId ?? null,
        expectedTriggerDigest: input.expectedTriggerDigest,
        expectedDependencyDigest: input.expectedDependencyDigest,
        expectedDownstreamBasisDigest: input.expectedDownstreamBasisDigest,
        disposition: input.disposition,
        evaluatorType: input.evaluatorType,
        evaluatorRef: input.evaluatorRef,
        method: input.method,
        methodVersion: input.methodVersion,
        evidenceArtifactId: input.evidenceArtifactId,
        reason: input.reason ?? null,
        assessedAt: new Date(input.assessedAt),
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.reliance-propagation-assessment.persisted.v1',
      replayed: result.replayed,
      assessment: result.assessment,
    });
  });

  app.get('/v1/actors/:actorId/reliance-dependencies', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    return {
      version: 'noeone.reliance-dependency-list.v1',
      data: await getRelianceDependencies(params.actorId, query.limit),
    };
  });

  app.get('/v1/reliance-dependencies/:dependencyId/assessments', async (request) => {
    assertAdmin(request);
    const params = z.object({ dependencyId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    return {
      version: 'noeone.reliance-propagation-assessment-list.v1',
      data: await getReliancePropagationAssessments(params.dependencyId, query.limit),
    };
  });

  app.get('/v1/reliance-bases/:relianceId/exposure', async (request) => {
    assertAdmin(request);
    const params = z.object({ relianceId: boundedId }).parse(request.params);
    const query = exposureSchema.parse(request.query);
    return buildRelianceExposureReport(params.relianceId, query);
  });

  app.get('/v1/actors/:actorId/reliance-propagation/verify', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    return verifyReliancePropagation(params.actorId);
  });
}
