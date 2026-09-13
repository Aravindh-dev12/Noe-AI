import type { FastifyInstance } from 'fastify';
import type {
  DecisionFrontierRecord,
  ForeseeabilityAssessment,
  OutcomeForecastRecord,
} from '@onbae/actor-core';
import {
  getDecisionFrontier,
  getForeseeabilityAssessment,
  getOutcomeForecast,
  listDecisionForeseeabilityAssessments,
  listDecisionOutcomeForecasts,
  recordDecisionFrontier,
  recordForeseeabilityAssessment,
  recordOutcomeForecast,
  verifyDecisionForeseeabilityRecord,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const boundedId = z.string().min(1).max(240);
const boundedRef = z.string().min(1).max(1200);
const digest = z.string().min(8).max(240);
const timestamp = z.string().datetime({ offset: true });

const candidateSchema = z
  .object({
    id: boundedId,
    actionDigest: digest,
    actionClass: z.string().min(1).max(300),
    parametersDigest: digest,
    source: z.enum([
      'environment',
      'deterministic-proposer',
      'policy-engine',
      'human-supervisor',
      'agent-generated',
      'external-planner',
      'replay-search',
      'other',
    ]),
    observedAt: timestamp,
    validUntil: timestamp.optional(),
    availability: z.enum(['available', 'unavailable', 'unknown']),
    policyDisposition: z.enum(['permitted', 'conditional', 'forbidden', 'unknown']),
    effectClass: z.enum(['reversible', 'conditionally-reversible', 'irreversible', 'unknown']),
    approvalRef: boundedRef.optional(),
    deadline: timestamp.optional(),
    estimatedCost: z
      .object({
        monetaryMinor: z.number().finite().nonnegative().optional(),
        computeUnits: z.number().finite().nonnegative().optional(),
        estimatedDurationMs: z.number().finite().nonnegative().optional(),
      })
      .strict()
      .optional(),
    evidenceRefs: z.array(boundedRef).max(128),
  })
  .strict();

const frontierSchema = z
  .object({
    version: z.literal('noeone.decision-frontier.v1'),
    id: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    executionId: boundedId.optional(),
    decisionAt: timestamp,
    capturedAt: timestamp,
    completeness: z.enum([
      'exhaustive-within-declared-boundary',
      'bounded-policy-set',
      'sampled',
      'unknown',
    ]),
    boundary: z
      .object({
        environmentStateDigest: digest,
        actionSchemaRef: boundedRef,
        actionSchemaDigest: digest,
        enforcementRef: boundedRef.optional(),
        policyRef: boundedRef.optional(),
        policyDigest: digest.optional(),
        toolCatalogDigest: digest.optional(),
        authoritySnapshotRef: boundedRef.optional(),
        epistemicInquiryRef: boundedRef.optional(),
        generatorMethodRef: boundedRef.optional(),
      })
      .strict(),
    candidates: z.array(candidateSchema).min(1).max(512),
    selectedActionDigest: digest,
    selectedCandidateId: boundedId.optional(),
    safeDefaultCandidateId: boundedId.optional(),
    attestor: z.enum([
      'runtime',
      'host',
      'policy-engine',
      'human-supervisor',
      'external-auditor',
      'agent-self-report',
    ]),
    attestationRef: boundedRef,
    candidateSetDigest: digest,
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 512_000, {
    message: 'Decision frontier exceeds the 512 KB ingestion limit.',
  });

const probabilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), value: z.number().finite().min(0).max(1) }).strict(),
  z
    .object({
      kind: z.literal('interval'),
      lower: z.number().finite().min(0).max(1),
      upper: z.number().finite().min(0).max(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ordinal'),
      level: z.enum(['very-low', 'low', 'medium', 'high', 'very-high']),
    })
    .strict(),
  z.object({ kind: z.literal('not-estimated') }).strict(),
]);

const forecastSchema = z
  .object({
    version: z.literal('noeone.outcome-forecast.v1'),
    id: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    frontierRecordId: boundedId,
    candidateId: boundedId,
    actionDigest: digest,
    executionId: boundedId.optional(),
    forecastAt: timestamp,
    decisionAt: timestamp,
    horizonStartAt: timestamp,
    horizonEndAt: timestamp,
    sourceKind: z.enum([
      'actor-runtime',
      'host-risk-engine',
      'policy-engine',
      'simulation',
      'actuarial-model',
      'independent-model',
      'human-expert',
      'ensemble',
      'other',
    ]),
    forecasterId: z.string().min(1).max(300),
    attestationRef: boundedRef,
    method: z.string().min(1).max(300),
    methodVersion: z.string().min(1).max(160),
    environmentStateDigest: digest,
    epistemicInquiryRef: boundedRef.optional(),
    referenceClassRef: boundedRef.optional(),
    evidence: z
      .array(
        z
          .object({
            ref: boundedRef,
            observedAt: timestamp,
          })
          .strict(),
      )
      .max(512),
    outcomes: z
      .array(
        z
          .object({
            id: boundedId,
            outcomeClass: z.string().min(1).max(300),
            taxonomyRef: boundedRef.optional(),
            targetRef: boundedRef.optional(),
            probability: probabilitySchema,
            severityScaleRef: boundedRef.optional(),
            severityLevel: z.string().min(1).max(160).optional(),
            expectedLossMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
            evidenceRefs: z.array(boundedRef).max(128),
          })
          .strict(),
      )
      .min(1)
      .max(256),
    residualUnknownRisk: z.enum(['explicitly-modeled', 'acknowledged', 'not-stated']),
    basisDigest: digest,
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 512_000, {
    message: 'Outcome forecast exceeds the 512 KB ingestion limit.',
  });

const assessmentSchema = z
  .object({
    version: z.literal('noeone.foreseeability-assessment.v1'),
    id: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    consequenceObservationRef: boundedId,
    evaluatorId: z.string().min(1).max(300),
    attestationRef: boundedRef,
    method: z.string().min(1).max(300),
    methodVersion: z.string().min(1).max(160),
    dimension: z.enum([
      'kind-of-harm',
      'severity',
      'causal-path',
      'timing',
      'affected-party',
      'aggregate-risk',
    ]),
    disposition: z.enum(['foreseeable', 'not-foreseeable', 'indeterminate', 'disputed']),
    forecastRecordRefs: z.array(boundedId).max(128),
    decisionFrontierRef: boundedId,
    epistemicInquiryRef: boundedRef.optional(),
    assessedAt: timestamp,
    evidenceRefs: z.array(boundedRef).max(128),
    basisDigest: digest,
  })
  .strict();

const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const verifyParamsSchema = z.object({
  kind: z.enum(['frontier', 'forecast', 'assessment']),
  id: boundedId,
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-foreseeability@1.0.0',
    issuer: 'noeone',
  } as const;
}

function eventEnvelope(event: {
  id: string;
  actorId: string;
  sequence: number;
  executionId: string | null;
  type: string;
  occurredAt: Date;
  observedAt: Date;
  hash: string;
  previousEventHash: string | null;
  signature: string | null;
  canonicalStatus: string;
}) {
  return {
    id: event.id,
    actorId: event.actorId,
    sequence: event.sequence,
    executionId: event.executionId,
    type: event.type,
    occurredAt: event.occurredAt,
    observedAt: event.observedAt,
    hash: event.hash,
    previousEventHash: event.previousEventHash,
    signature: event.signature,
    canonicalStatus: event.canonicalStatus.toLowerCase(),
  };
}

export async function decisionForeseeabilityRoutes(app: FastifyInstance) {
  app.post('/v1/decision-frontiers', async (request, reply) => {
    assertAdmin(request);
    const record = frontierSchema.parse(request.body) as DecisionFrontierRecord;
    const result = await recordDecisionFrontier(record, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.decision-frontier.persisted.v1',
      replayed: result.replayed,
      record: result.record,
      recordDigest: result.recordDigest,
      event: eventEnvelope(result.event),
    });
  });

  app.get('/v1/decision-frontiers/:recordId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    const result = await getDecisionFrontier(params.recordId);
    if (!result) return reply.code(404).send({ error: 'decision_frontier_not_found' });
    return {
      version: 'noeone.decision-frontier.persisted.v1',
      record: result.record,
      recordDigest: result.recordDigest,
      event: eventEnvelope(result.event),
    };
  });

  app.post('/v1/foreseeability/forecasts', async (request, reply) => {
    assertAdmin(request);
    const record = forecastSchema.parse(request.body) as OutcomeForecastRecord;
    const result = await recordOutcomeForecast(record, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.outcome-forecast.persisted.v1',
      replayed: result.replayed,
      record: result.record,
      recordDigest: result.recordDigest,
      frontierDigest: result.frontierDigest,
      event: eventEnvelope(result.event),
    });
  });

  app.get('/v1/foreseeability/forecasts/:forecastId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ forecastId: boundedId }).parse(request.params);
    const result = await getOutcomeForecast(params.forecastId);
    if (!result) return reply.code(404).send({ error: 'outcome_forecast_not_found' });
    return {
      version: 'noeone.outcome-forecast.persisted.v1',
      record: result.record,
      recordDigest: result.recordDigest,
      frontierDigest: result.frontierDigest,
      event: eventEnvelope(result.event),
    };
  });

  app.get('/v1/decision-frontiers/:recordId/forecasts', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const data = await listDecisionOutcomeForecasts(params.recordId, query.limit);
    if (!data) return reply.code(404).send({ error: 'decision_frontier_not_found' });
    return {
      version: 'noeone.decision-forecasts.v1',
      recordId: params.recordId,
      data: data.map((item) => ({
        record: item.record,
        recordDigest: item.recordDigest,
        frontierDigest: item.frontierDigest,
        event: eventEnvelope(item.event),
      })),
    };
  });

  app.post('/v1/foreseeability/assessments', async (request, reply) => {
    assertAdmin(request);
    const assessment = assessmentSchema.parse(request.body) as ForeseeabilityAssessment;
    const result = await recordForeseeabilityAssessment(assessment, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.foreseeability-assessment.persisted.v1',
      replayed: result.replayed,
      assessment: result.assessment,
      assessmentDigest: result.assessmentDigest,
      event: eventEnvelope(result.event),
    });
  });

  app.get('/v1/foreseeability/assessments/:assessmentId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ assessmentId: boundedId }).parse(request.params);
    const result = await getForeseeabilityAssessment(params.assessmentId);
    if (!result) return reply.code(404).send({ error: 'foreseeability_assessment_not_found' });
    return {
      version: 'noeone.foreseeability-assessment.persisted.v1',
      assessment: result.assessment,
      assessmentDigest: result.assessmentDigest,
      event: eventEnvelope(result.event),
    };
  });

  app.get('/v1/decision-frontiers/:recordId/foreseeability-assessments', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const data = await listDecisionForeseeabilityAssessments(params.recordId, query.limit);
    if (!data) return reply.code(404).send({ error: 'decision_frontier_not_found' });
    return {
      version: 'noeone.decision-foreseeability-assessments.v1',
      recordId: params.recordId,
      data: data.map((item) => ({
        assessment: item.assessment,
        assessmentDigest: item.assessmentDigest,
        event: eventEnvelope(item.event),
      })),
    };
  });

  app.get('/v1/foreseeability/verify/:kind/:id', async (request) => {
    assertAdmin(request);
    const params = verifyParamsSchema.parse(request.params);
    return {
      version: 'noeone.foreseeability-verification.v1',
      kind: params.kind,
      id: params.id,
      ...(await verifyDecisionForeseeabilityRecord(params.kind, params.id, env.EVENT_SIGNING_SECRET)),
    };
  });
}
