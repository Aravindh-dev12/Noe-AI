import type { FastifyInstance } from 'fastify';
import {
  getDependencyImpactAssessment,
  getDependencyIncidentTriage,
  listDependencyImpactAssessments,
  recordDependencyImpactAssessment,
  verifyDependencyImpactAssessment,
} from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';

const dispositionSchema = z.enum([
  'AFFECTED',
  'NOT_AFFECTED',
  'UNDER_INVESTIGATION',
  'MITIGATED',
  'DISPUTED',
]);

const createAssessmentSchema = z.object({
  incidentId: z.string().min(1),
  actorId: z.string().min(1),
  executionId: z.string().min(1),
  disposition: dispositionSchema,
  evaluator: z.string().min(1).max(500),
  method: z.string().min(1).max(240),
  methodVersion: z.string().min(1).max(120),
  sourceEvidenceArtifactId: z.string().min(1),
  exposureAt: z.coerce.date().optional(),
  confidenceBps: z.number().int().min(0).max(10_000).optional(),
  maxDepth: z.number().int().min(0).max(16).default(8),
  idempotencyKey: z.string().min(8).max(240),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const assessmentParams = z.object({ assessmentId: z.string().min(1) });
const incidentParams = z.object({ incidentId: z.string().min(1) });
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const triageQuery = z.object({
  at: z.coerce.date().optional(),
  maxDepth: z.coerce.number().int().min(0).max(16).default(8),
});

export async function dependencyImpactRoutes(app: FastifyInstance) {
  // Impact/applicability evidence can reveal incidents and internal topology.
  // Keep the full surface privileged until explicit disclosure policy exists.
  app.post('/v1/dependencies/impact-assessments', async (request, reply) => {
    assertAdmin(request);
    const input = createAssessmentSchema.parse(request.body);
    const result = await recordDependencyImpactAssessment({
      incidentId: input.incidentId,
      actorId: input.actorId,
      executionId: input.executionId,
      disposition: input.disposition,
      evaluator: input.evaluator,
      method: input.method,
      methodVersion: input.methodVersion,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      ...(input.exposureAt !== undefined ? { exposureAt: input.exposureAt } : {}),
      ...(input.confidenceBps !== undefined ? { confidenceBps: input.confidenceBps } : {}),
      maxDepth: input.maxDepth,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/dependencies/impact-assessments/:assessmentId', async (request) => {
    assertAdmin(request);
    const params = assessmentParams.parse(request.params);
    return getDependencyImpactAssessment(params.assessmentId);
  });

  app.get('/v1/dependencies/impact-assessments/:assessmentId/verify', async (request) => {
    assertAdmin(request);
    const params = assessmentParams.parse(request.params);
    return verifyDependencyImpactAssessment(params.assessmentId);
  });

  app.get('/v1/dependencies/incidents/:incidentId/assessments', async (request) => {
    assertAdmin(request);
    const params = incidentParams.parse(request.params);
    const query = listQuery.parse(request.query);
    return {
      version: 'noeone.dependency-impact-assessments.v1',
      incidentId: params.incidentId,
      data: await listDependencyImpactAssessments(params.incidentId, query.limit),
      universalVerdict: null,
    };
  });

  app.get('/v1/dependencies/incidents/:incidentId/triage', async (request) => {
    assertAdmin(request);
    const params = incidentParams.parse(request.params);
    const query = triageQuery.parse(request.query);
    return getDependencyIncidentTriage(params.incidentId, query.at, query.maxDepth);
  });
}
