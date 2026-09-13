import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DecisionInquiryRecord, EpistemicDiligenceAssessment } from '@onbae/actor-core';

import {
  db,
  getDecisionInquiry,
  listActorDecisionInquiries,
  listEpistemicDiligenceAssessments,
  recordDecisionInquiry,
  recordEpistemicDiligenceAssessment,
  verifyDecisionInquiry,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_epistemic_${suffix}`;
const actorId = `act_epistemic_${suffix}`;
const executionId = `exec_epistemic_${suffix}`;
const lineageId = `lin_epistemic_${suffix}`;
const signingSecret = 'test-epistemic-signing-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-epistemic-diligence@test',
  issuer: 'noeone-test',
} as const;

function inquiry(id = `inq_${suffix}`): DecisionInquiryRecord {
  return {
    version: 'noeone.decision-inquiry-record.v1',
    id,
    actorId,
    decisionId: `decision_${suffix}`,
    executionId,
    actionRef: `authority-exercise:${suffix}`,
    decisionAt: '2026-09-13T10:00:00.000Z',
    recordedAt: '2026-09-13T10:00:01.000Z',
    riskTier: 'critical',
    policy: {
      id: 'payments-verification',
      version: '1',
      digest: `sha256:${'a'.repeat(64)}`,
    },
    opportunities: [
      {
        id: 'opp-authoritative-balance',
        capabilityKind: 'authoritative-balance-check',
        sourceClass: 'authoritative-source',
        status: 'available',
        attestor: 'runtime',
        attestationRef: `runtime-capabilities:${suffix}`,
        observedAt: '2026-09-13T09:59:40.000Z',
        validUntil: '2026-09-13T10:01:00.000Z',
      },
    ],
    requirements: [
      {
        id: 'req-authoritative-balance',
        description: 'Verify current balance against the authoritative ledger.',
        mandatory: true,
        capabilityKinds: ['authoritative-balance-check'],
        acceptedSourceClasses: ['authoritative-source'],
        acceptedOpportunityAttestors: ['runtime', 'host'],
        maxEvidenceAgeSeconds: 120,
      },
    ],
    attempts: [
      {
        id: 'attempt-authoritative-balance',
        requirementId: 'req-authoritative-balance',
        opportunityId: 'opp-authoritative-balance',
        outcome: 'completed',
        startedAt: '2026-09-13T09:59:45.000Z',
        finishedAt: '2026-09-13T09:59:50.000Z',
        evidenceRefs: ['evidence-authoritative-balance'],
      },
    ],
    evidenceUsed: [
      {
        id: 'evidence-authoritative-balance',
        sourceRef: `bank-ledger:${suffix}`,
        digest: `sha256:${'b'.repeat(64)}`,
        sourceClass: 'authoritative-source',
        observedAt: '2026-09-13T09:59:50.000Z',
      },
    ],
    unresolvedConflicts: [],
    constraints: {
      timeBudgetMs: 30_000,
      monetaryBudgetMinor: 50,
      networkAccess: 'available',
      humanEscalation: 'available',
    },
    evidenceBundleRef: `bundle:${suffix}`,
  };
}

beforeAll(async () => {
  const startedAt = new Date('2026-09-13T09:00:00.000Z');
  await db.host.create({
    data: {
      id: hostId,
      slug: `epistemic-${suffix}`,
      displayName: 'Epistemic Diligence Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `epi-${suffix}`.slice(0, 32),
      displayName: `Epistemic Actor ${suffix}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: startedAt,
    },
  });
  await db.actorExecution.create({
    data: {
      id: executionId,
      actorId,
      provider: 'mock',
      model: 'epistemic-model-a',
      runtime: 'epistemic-runtime-a',
      configHash: `sha256:${'c'.repeat(64)}`,
      startedAt,
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: startedAt,
    },
  });
});

afterAll(async () => {
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('epistemic diligence canonical ledger', () => {
  it('persists a decision inquiry as a signed canonical event and replays idempotently', async () => {
    const record = inquiry();
    const first = await recordDecisionInquiry(record, registry);
    expect(first.replayed).toBe(false);
    expect(first.coverage.mandatorySatisfied).toBe(1);
    expect(first.event.type).toBe('epistemic.inquiry.recorded');
    expect(first.event.actorId).toBe(actorId);
    expect(first.event.executionId).toBe(executionId);
    expect(first.event.signature).toBeTruthy();

    const replay = await recordDecisionInquiry(record, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);
    expect(replay.recordDigest).toBe(first.recordDigest);

    const persisted = await getDecisionInquiry(record.id);
    expect(persisted?.record.actorId).toBe(actorId);
    expect(persisted?.coverage.requirements[0]?.disposition).toBe('satisfied');

    const verification = await verifyDecisionInquiry(record.id, signingSecret);
    expect(verification.valid).toBe(true);
    expect(verification.issues).toEqual([]);
    expect(verification.recordDigest).toBe(first.recordDigest);
  });

  it('rejects semantic id reuse with altered inquiry content', async () => {
    const record = inquiry();
    const conflicting: DecisionInquiryRecord = { ...record, riskTier: 'low' };

    await expect(recordDecisionInquiry(conflicting, registry)).rejects.toThrow(
      /replayed with conflicting content/,
    );
  });

  it('binds the inquiry to an execution that represented the actor at decision time', async () => {
    const otherId = `inq_early_${suffix}`;
    const invalid: DecisionInquiryRecord = {
      ...inquiry(otherId),
      decisionId: `decision_early_${suffix}`,
      decisionAt: '2026-09-13T08:59:00.000Z',
      recordedAt: '2026-09-13T08:59:01.000Z',
      opportunities: [],
      requirements: [],
      attempts: [],
      evidenceUsed: [],
    };

    await expect(recordDecisionInquiry(invalid, registry)).rejects.toThrow(
      /Execution had not started at decision time/,
    );
  });

  it('appends evaluator-specific assessments without mutating the inquiry', async () => {
    const record = inquiry();
    const original = await getDecisionInquiry(record.id);
    expect(original).not.toBeNull();

    const assessmentA: EpistemicDiligenceAssessment = {
      version: 'noeone.epistemic-diligence-assessment.v1',
      id: `assessment_a_${suffix}`,
      decisionInquiryRecordId: record.id,
      evaluatorId: 'insurer-a',
      policyId: 'insurer-a-diligence',
      policyVersion: '7',
      disposition: 'sufficient',
      assessedAt: '2026-09-13T11:00:00.000Z',
      evidenceRefs: [record.evidenceBundleRef],
      rationaleCode: 'authoritative-check-satisfied',
    };
    const assessmentB: EpistemicDiligenceAssessment = {
      ...assessmentA,
      id: `assessment_b_${suffix}`,
      evaluatorId: 'regulator-b',
      policyId: 'regulator-b-diligence',
      disposition: 'insufficient',
      rationaleCode: 'human-escalation-required-for-critical-action',
    };

    const first = await recordEpistemicDiligenceAssessment(assessmentA, registry);
    const second = await recordEpistemicDiligenceAssessment(assessmentB, registry);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(first.event.id).not.toBe(second.event.id);

    const replay = await recordEpistemicDiligenceAssessment(assessmentA, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    const assessments = await listEpistemicDiligenceAssessments(record.id);
    expect(assessments).not.toBeNull();
    expect(assessments).toHaveLength(2);
    expect(assessments?.map((entry) => entry.assessment.disposition)).toEqual([
      'sufficient',
      'insufficient',
    ]);

    const after = await getDecisionInquiry(record.id);
    expect(after?.recordDigest).toBe(original?.recordDigest);
    expect(after?.record).toEqual(original?.record);
  });

  it('lists actor inquiries from canonical events without exposing unrelated actor history', async () => {
    const records = await listActorDecisionInquiries(actorId, 10);
    expect(records.some((entry) => entry.record.id === inquiry().id)).toBe(true);
    expect(records.every((entry) => entry.event.actorId === actorId)).toBe(true);
  });
});
