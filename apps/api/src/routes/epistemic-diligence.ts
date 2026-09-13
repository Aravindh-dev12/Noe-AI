import type { FastifyInstance } from 'fastify';
import { normalizeHandle, type DecisionInquiryRecord, type EpistemicDiligenceAssessment } from '@onbae/actor-core';
import {
  db,
  getDecisionInquiry,
  listActorDecisionInquiries,
  listEpistemicDiligenceAssessments,
  recordDecisionInquiry,
  recordEpistemicDiligenceAssessment,
  verifyDecisionInquiry,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const sourceClassSchema = z.enum([
  'authoritative-source',
  'independent-source',
  'formal-verifier',
  'human-expert',
  'peer-agent',
  'same-generator',
  'other',
]);
const opportunityAttestorSchema = z.enum([
  'runtime',
  'host',
  'principal',
  'external-auditor',
  'agent-self-report',
]);
const boundedRef = z.string().min(1).max(1000);
const boundedId = z.string().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });

const opportunitySchema = z
  .object({
    id: boundedId,
    capabilityKind: z.string().min(1).max(240),
    sourceClass: sourceClassSchema,
    status: z.enum(['available', 'unavailable', 'unknown']),
    attestor: opportunityAttestorSchema,
    attestationRef: boundedRef,
    observedAt: timestamp,
    validFrom: timestamp.optional(),
    validUntil: timestamp.optional(),
    constraintCode: z.string().min(1).max(240).optional(),
  })
  .strict();

const requirementSchema = z
  .object({
    id: boundedId,
    description: z.string().min(1).max(1000),
    mandatory: z.boolean(),
    capabilityKinds: z.array(z.string().min(1).max(240)).min(1).max(32),
    acceptedSourceClasses: z.array(sourceClassSchema).min(1).max(7),
    acceptedOpportunityAttestors: z.array(opportunityAttestorSchema).min(1).max(5),
    maxEvidenceAgeSeconds: z.number().int().positive().max(31_536_000).optional(),
  })
  .strict();

const attemptSchema = z
  .object({
    id: boundedId,
    requirementId: boundedId,
    opportunityId: boundedId,
    outcome: z.enum(['completed', 'failed', 'blocked', 'timed-out', 'skipped']),
    startedAt: timestamp,
    finishedAt: timestamp.optional(),
    evidenceRefs: z.array(boundedId).max(64),
    reasonCode: z.string().min(1).max(240).optional(),
  })
  .strict();

const evidenceSchema = z
  .object({
    id: boundedId,
    sourceRef: boundedRef,
    digest: z.string().min(8).max(240),
    sourceClass: sourceClassSchema,
    observedAt: timestamp,
    provenanceRootRef: boundedRef.optional(),
  })
  .strict();

const conflictSchema = z
  .object({
    id: boundedId,
    evidenceRefs: z.array(boundedId).min(2).max(64),
    detectedAt: timestamp,
    status: z.enum(['unresolved', 'escalated', 'accepted-risk']),
  })
  .strict();

const constraintsSchema = z
  .object({
    timeBudgetMs: z.number().int().nonnegative().max(86_400_000).optional(),
    monetaryBudgetMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    networkAccess: z.enum(['available', 'restricted', 'unavailable', 'unknown']),
    humanEscalation: z.enum(['available', 'restricted', 'unavailable', 'unknown']),
    notes: z.array(z.string().min(1).max(500)).max(32).optional(),
  })
  .strict();

const inquirySchema = z
  .object({
    version: z.literal('noeone.decision-inquiry-record.v1'),
    id: boundedId,
    actorId: boundedId,
    decisionId: boundedId,
    executionId: boundedId.optional(),
    actionRef: boundedRef.optional(),
    decisionAt: timestamp,
    recordedAt: timestamp,
    riskTier: z.enum(['low', 'moderate', 'high', 'critical']),
    policy: z
      .object({
        id: boundedId,
        version: z.string().min(1).max(120),
        digest: z.string().min(8).max(240),
      })
      .strict(),
    opportunities: z.array(opportunitySchema).max(128),
    requirements: z.array(requirementSchema).max(64),
    attempts: z.array(attemptSchema).max(256),
    evidenceUsed: z.array(evidenceSchema).max(512),
    unresolvedConflicts: z.array(conflictSchema).max(64),
    constraints: constraintsSchema,
    evidenceBundleRef: boundedRef,
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 256_000, {
    message: 'Decision inquiry record exceeds the 256 KB ingestion limit.',
  });

const assessmentSchema = z
  .object({
    version: z.literal('noeone.epistemic-diligence-assessment.v1'),
    id: boundedId,
    decisionInquiryRecordId: boundedId,
    evaluatorId: z.string().min(1).max(300),
    policyId: boundedId,
    policyVersion: z.string().min(1).max(120),
    disposition: z.enum(['sufficient', 'insufficient', 'indeterminate', 'disputed']),
    assessedAt: timestamp,
    evidenceRefs: z.array(boundedRef).max(128),
    rationaleCode: z.string().min(1).max(240),
  })
  .strict();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-epistemic-diligence@1.0.0',
    issuer: 'noeone',
  } as const;
}

function publicEventEnvelope(event: {
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

export async function epistemicDiligenceRoutes(app: FastifyInstance) {
  app.post('/v1/epistemic/inquiries', async (request, reply) => {
    assertAdmin(request);
    const record = inquirySchema.parse(request.body) as DecisionInquiryRecord;
    const result = await recordDecisionInquiry(record, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.epistemic-inquiry.persisted.v1',
      replayed: result.replayed,
      record: result.record,
      coverage: result.coverage,
      recordDigest: result.recordDigest,
      event: publicEventEnvelope(result.event),
    });
  });

  app.get('/v1/epistemic/inquiries/:recordId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    const result = await getDecisionInquiry(params.recordId);
    if (!result) return reply.code(404).send({ error: 'decision_inquiry_not_found' });
    return {
      version: 'noeone.epistemic-inquiry.persisted.v1',
      record: result.record,
      coverage: result.coverage,
      recordDigest: result.recordDigest,
      event: publicEventEnvelope(result.event),
    };
  });

  app.get('/v1/epistemic/inquiries/:recordId/verify', async (request) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    return {
      version: 'noeone.epistemic-inquiry.verification.v1',
      recordId: params.recordId,
      ...(await verifyDecisionInquiry(params.recordId, env.EVENT_SIGNING_SECRET)),
    };
  });

  app.post('/v1/epistemic/assessments', async (request, reply) => {
    assertAdmin(request);
    const assessment = assessmentSchema.parse(request.body) as EpistemicDiligenceAssessment;
    const result = await recordEpistemicDiligenceAssessment(assessment, registryContext());
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.epistemic-assessment.persisted.v1',
      replayed: result.replayed,
      assessment: result.assessment,
      assessmentDigest: result.assessmentDigest,
      inquiryRecordDigest: result.inquiryRecordDigest,
      event: publicEventEnvelope(result.event),
    });
  });

  app.get('/v1/epistemic/inquiries/:recordId/assessments', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ recordId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const assessments = await listEpistemicDiligenceAssessments(params.recordId, query.limit);
    if (!assessments) return reply.code(404).send({ error: 'decision_inquiry_not_found' });
    return {
      version: 'noeone.epistemic-assessments.v1',
      recordId: params.recordId,
      data: assessments.map((item) => ({
        assessment: item.assessment,
        assessmentDigest: item.assessmentDigest,
        inquiryRecordDigest: item.inquiryRecordDigest,
        event: publicEventEnvelope(item.event),
      })),
    };
  });

  app.get('/v1/actors/:handle/epistemic-inquiries', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ handle: z.string().min(1).max(64) }).parse(request.params);
    const query = listSchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true, handle: true, displayName: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    const records = await listActorDecisionInquiries(actor.id, query.limit);
    return {
      version: 'noeone.actor-epistemic-inquiries.v1',
      actor,
      data: records.map((item) => ({
        record: item.record,
        coverage: item.coverage,
        recordDigest: item.recordDigest,
        event: publicEventEnvelope(item.event),
      })),
    };
  });
}
