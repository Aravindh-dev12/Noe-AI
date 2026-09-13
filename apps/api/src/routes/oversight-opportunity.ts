import type { FastifyInstance } from 'fastify';
import type {
  InterventionAttemptRecord,
  InterventionFrontierRecord,
  OversightEffectivenessAssessment,
} from '@onbae/actor-core';
import { deriveInterventionStructuralFacts } from '@onbae/actor-core';
import {
  getInterventionAttempt,
  getInterventionFrontier,
  getOversightEffectivenessAssessment,
  listDecisionInterventionFrontiers,
  listInterventionAttempts,
  listOversightEffectivenessAssessments,
  recordInterventionAttempt,
  recordInterventionFrontier,
  recordOversightEffectivenessAssessment,
  verifyOversightOpportunityRecord,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const boundedId = z.string().min(1).max(240);
const boundedRef = z.string().min(1).max(1200);
const digest = z.string().min(8).max(240);
const timestamp = z.string().datetime({ offset: true });

const noticeSchema = z
  .object({
    deliveryStatus: z.enum([
      'not-issued',
      'issued',
      'delivered',
      'acknowledged',
      'failed',
      'unknown',
    ]),
    issuedAt: timestamp.optional(),
    deliveredAt: timestamp.optional(),
    acknowledgedAt: timestamp.optional(),
    channel: z.string().min(1).max(200).optional(),
    evidenceRefs: z.array(boundedRef).max(128),
  })
  .strict();

const controlSchema = z
  .object({
    id: boundedId,
    kind: z.enum([
      'approve',
      'veto',
      'pause',
      'stop',
      'modify',
      'substitute',
      'escalate',
      'revoke-authority',
      'rollback',
    ]),
    authorityRef: boundedRef,
    enforcementRef: boundedRef,
    availableFrom: timestamp,
    availableUntil: timestamp.optional(),
    scopeDigest: digest,
    evidenceRefs: z.array(boundedRef).max(128),
  })
  .strict();

const interventionFrontierSchema = z
  .object({
    version: z.literal('noe.intervention-frontier.v1'),
    id: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    decisionFrontierRef: boundedId,
    selectedActionDigest: digest,
    executionId: boundedId.optional(),
    decisionAt: timestamp,
    windowOpenedAt: timestamp,
    interventionDeadlineAt: timestamp,
    deadlineEvidenceRefs: z.array(boundedRef).min(1).max(128),
    closeReason: z.enum([
      'effect-committed',
      'deadline',
      'authority-expired',
      'state-changed',
      'cancelled',
      'unknown',
    ]),
    requirement: z
      .object({
        mode: z.enum(['mandatory', 'conditional', 'advisory', 'not-required']),
        policyRefs: z.array(boundedRef).max(128),
      })
      .strict(),
    overseer: z
      .object({
        principalKind: z.enum([
          'human',
          'organization',
          'supervisory-agent',
          'policy-engine',
          'other',
        ]),
        principalRef: boundedRef,
        identityAttestationRef: boundedRef,
        assignedAt: timestamp,
        authorityRefs: z.array(boundedRef).max(128),
        competenceEvidenceRefs: z.array(boundedRef).max(128),
      })
      .strict(),
    notice: noticeSchema,
    information: z
      .object({
        bundleDigest: digest,
        availableAt: timestamp,
        evidenceRefs: z.array(boundedRef).max(256),
        explanationRef: boundedRef.optional(),
        forecastRefs: z.array(boundedId).max(128),
      })
      .strict(),
    controls: z.array(controlSchema).max(128),
    fallback: z
      .object({
        onNoResponse: z.enum(['allow', 'deny', 'pause', 'escalate', 'unknown']),
        triggerAt: timestamp.optional(),
        enforcementRef: boundedRef.optional(),
      })
      .strict(),
    captureMode: z.enum(['contemporaneous', 'reconstructed']),
    capturedAt: timestamp,
    attestorId: z.string().min(1).max(300),
    attestationRef: boundedRef,
    basisDigest: digest,
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 512_000, {
    message: 'Intervention Frontier exceeds the 512 KB ingestion limit.',
  });

const interventionAttemptSchema = z
  .object({
    version: z.literal('noe.intervention-attempt.v1'),
    id: boundedId,
    frontierId: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    overseerPrincipalRef: boundedRef,
    controlId: boundedId,
    controlKind: z.enum([
      'approve',
      'veto',
      'pause',
      'stop',
      'modify',
      'substitute',
      'escalate',
      'revoke-authority',
      'rollback',
    ]),
    attemptedAt: timestamp,
    completedAt: timestamp.optional(),
    outcome: z.enum(['succeeded', 'failed', 'rejected', 'too-late', 'partially-effective']),
    attestationRef: boundedRef,
    evidenceRefs: z.array(boundedRef).max(128),
    basisDigest: digest,
  })
  .strict();

const oversightAssessmentSchema = z
  .object({
    version: z.literal('noe.oversight-assessment.v1'),
    id: boundedId,
    frontierId: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    evaluatorId: z.string().min(1).max(300),
    attestationRef: boundedRef,
    method: z.string().min(1).max(300),
    methodVersion: z.string().min(1).max(160),
    dimension: z.enum([
      'timeliness',
      'information-sufficiency',
      'authority',
      'technical-control',
      'operator-capacity',
      'overall-opportunity',
    ]),
    disposition: z.enum(['meaningful', 'nominal', 'unavailable', 'indeterminate', 'disputed']),
    assessedAt: timestamp,
    attemptRefs: z.array(boundedId).max(128),
    consequenceObservationRefs: z.array(boundedId).max(128),
    evidenceRefs: z.array(boundedRef).max(256),
    basisDigest: digest,
  })
  .strict();

const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const verifyParamsSchema = z.object({
  kind: z.enum(['frontier', 'attempt', 'assessment']),
  id: boundedId,
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noe-oversight@1.0.0',
    issuer: 'noe',
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

export async function oversightOpportunityRoutes(app: FastifyInstance) {
  app.post('/v1/intervention-frontiers', async (request, reply) => {
    assertAdmin(request);
    const record = interventionFrontierSchema.parse(request.body) as InterventionFrontierRecord;
    const result = await recordInterventionFrontier(record, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noe.intervention-frontier.persisted.v1',
      replayed: result.replayed,
      record: result.record,
      structuralFacts: deriveInterventionStructuralFacts(result.record),
      recordDigest: result.recordDigest,
      decisionFrontierDigest: result.decisionFrontierDigest,
      event: eventEnvelope(result.event),
    });
  });

  app.get('/v1/intervention-frontiers/:frontierId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ frontierId: boundedId }).parse(request.params);
    const result = await getInterventionFrontier(params.frontierId);
    if (!result) return reply.code(404).send({ error: 'intervention_frontier_not_found' });
    return {
      version: 'noe.intervention-frontier.persisted.v1',
      record: result.record,
      structuralFacts: deriveInterventionStructuralFacts(result.record),
      recordDigest: result.recordDigest,
      decisionFrontierDigest: result.decisionFrontierDigest,
      event: eventEnvelope(result.event),
    };
  });

  app.get('/v1/decision-frontiers/:recordId/intervention-frontiers', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const data = await listDecisionInterventionFrontiers(params.recordId, query.limit);
    if (!data) return reply.code(404).send({ error: 'decision_frontier_not_found' });
    return {
      version: 'noe.decision-intervention-frontiers.v1',
      recordId: params.recordId,
      data: data.map((item) => ({
        record: item.record,
        structuralFacts: deriveInterventionStructuralFacts(item.record),
        recordDigest: item.recordDigest,
        decisionFrontierDigest: item.decisionFrontierDigest,
        event: eventEnvelope(item.event),
      })),
    };
  });

  app.post('/v1/intervention-attempts', async (request, reply) => {
    assertAdmin(request);
    const record = interventionAttemptSchema.parse(request.body) as InterventionAttemptRecord;
    const result = await recordInterventionAttempt(record, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noe.intervention-attempt.persisted.v1',
      replayed: result.replayed,
      record: result.record,
      recordDigest: result.recordDigest,
      frontierDigest: result.frontierDigest,
      event: eventEnvelope(result.event),
    });
  });

  app.get('/v1/intervention-attempts/:attemptId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ attemptId: boundedId }).parse(request.params);
    const result = await getInterventionAttempt(params.attemptId);
    if (!result) return reply.code(404).send({ error: 'intervention_attempt_not_found' });
    return {
      version: 'noe.intervention-attempt.persisted.v1',
      record: result.record,
      recordDigest: result.recordDigest,
      frontierDigest: result.frontierDigest,
      event: eventEnvelope(result.event),
    };
  });

  app.get('/v1/intervention-frontiers/:frontierId/attempts', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ frontierId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const data = await listInterventionAttempts(params.frontierId, query.limit);
    if (!data) return reply.code(404).send({ error: 'intervention_frontier_not_found' });
    return {
      version: 'noe.intervention-attempts.v1',
      frontierId: params.frontierId,
      data: data.map((item) => ({
        record: item.record,
        recordDigest: item.recordDigest,
        frontierDigest: item.frontierDigest,
        event: eventEnvelope(item.event),
      })),
    };
  });

  app.post('/v1/oversight-assessments', async (request, reply) => {
    assertAdmin(request);
    const assessment = oversightAssessmentSchema.parse(
      request.body,
    ) as OversightEffectivenessAssessment;
    const result = await recordOversightEffectivenessAssessment(assessment, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noe.oversight-assessment.persisted.v1',
      replayed: result.replayed,
      assessment: result.assessment,
      assessmentDigest: result.assessmentDigest,
      frontierDigest: result.frontierDigest,
      event: eventEnvelope(result.event),
    });
  });

  app.get('/v1/oversight-assessments/:assessmentId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ assessmentId: boundedId }).parse(request.params);
    const result = await getOversightEffectivenessAssessment(params.assessmentId);
    if (!result) return reply.code(404).send({ error: 'oversight_assessment_not_found' });
    return {
      version: 'noe.oversight-assessment.persisted.v1',
      assessment: result.assessment,
      assessmentDigest: result.assessmentDigest,
      frontierDigest: result.frontierDigest,
      event: eventEnvelope(result.event),
    };
  });

  app.get('/v1/intervention-frontiers/:frontierId/assessments', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ frontierId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const data = await listOversightEffectivenessAssessments(params.frontierId, query.limit);
    if (!data) return reply.code(404).send({ error: 'intervention_frontier_not_found' });
    return {
      version: 'noe.oversight-assessments.v1',
      frontierId: params.frontierId,
      data: data.map((item) => ({
        assessment: item.assessment,
        assessmentDigest: item.assessmentDigest,
        frontierDigest: item.frontierDigest,
        event: eventEnvelope(item.event),
      })),
    };
  });

  app.get('/v1/oversight/verify/:kind/:id', async (request) => {
    assertAdmin(request);
    const params = verifyParamsSchema.parse(request.params);
    return {
      version: 'noe.oversight-verification.v1',
      kind: params.kind,
      id: params.id,
      ...(await verifyOversightOpportunityRecord(
        params.kind,
        params.id,
        env.EVENT_SIGNING_SECRET,
      )),
    };
  });
}
