import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DecisionFrontierRecord,
  InterventionAttemptRecord,
  InterventionFrontierRecord,
  OversightEffectivenessAssessment,
} from '@onbae/actor-core';

import {
  db,
  getInterventionAttempt,
  getInterventionFrontier,
  getOversightEffectivenessAssessment,
  listDecisionInterventionFrontiers,
  listInterventionAttempts,
  listOversightEffectivenessAssessments,
  recordDecisionFrontier,
  recordInterventionAttempt,
  recordInterventionFrontier,
  recordOversightEffectivenessAssessment,
  verifyOversightOpportunityRecord,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_oversight_${suffix}`;
const actorId = `act_oversight_${suffix}`;
const executionId = `exec_oversight_${suffix}`;
const lineageId = `lin_oversight_${suffix}`;
const signingSecret = 'test-oversight-opportunity-signing-secret-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noe-oversight@test',
  issuer: 'noe-test',
} as const;

function decisionFrontier(): DecisionFrontierRecord {
  return {
    version: 'noeone.decision-frontier.v1',
    id: `decision_frontier_${suffix}`,
    actorId,
    decisionId: `decision_${suffix}`,
    executionId,
    decisionAt: '2026-09-13T10:00:00.000Z',
    capturedAt: '2026-09-13T10:00:01.000Z',
    completeness: 'bounded-policy-set',
    boundary: {
      environmentStateDigest: `sha256:${'1'.repeat(64)}`,
      actionSchemaRef: 'schema:payments:v1',
      actionSchemaDigest: `sha256:${'2'.repeat(64)}`,
      enforcementRef: 'finality-sink:payments:v3',
      policyRef: 'policy:payments:v7',
      policyDigest: `sha256:${'3'.repeat(64)}`,
    },
    candidates: [
      {
        id: 'candidate-transfer',
        actionDigest: `sha256:${'4'.repeat(64)}`,
        actionClass: 'payment.transfer',
        parametersDigest: `sha256:${'5'.repeat(64)}`,
        source: 'policy-engine',
        observedAt: '2026-09-13T09:59:40.000Z',
        availability: 'available',
        policyDisposition: 'permitted',
        effectClass: 'irreversible',
        evidenceRefs: ['evidence:balance'],
      },
      {
        id: 'candidate-escalate',
        actionDigest: `sha256:${'6'.repeat(64)}`,
        actionClass: 'human.escalate',
        parametersDigest: `sha256:${'7'.repeat(64)}`,
        source: 'human-supervisor',
        observedAt: '2026-09-13T09:59:40.000Z',
        availability: 'available',
        policyDisposition: 'permitted',
        effectClass: 'reversible',
        evidenceRefs: [],
      },
    ],
    selectedActionDigest: `sha256:${'4'.repeat(64)}`,
    selectedCandidateId: 'candidate-transfer',
    safeDefaultCandidateId: 'candidate-escalate',
    attestor: 'policy-engine',
    attestationRef: `attestation:decision-frontier:${suffix}`,
    candidateSetDigest: `sha256:${'8'.repeat(64)}`,
  };
}

function interventionFrontier(
  overrides: Partial<InterventionFrontierRecord> = {},
): InterventionFrontierRecord {
  const decision = decisionFrontier();
  return {
    version: 'noe.intervention-frontier.v1',
    id: `intervention_frontier_${suffix}`,
    actorId,
    decisionId: decision.decisionId,
    decisionFrontierRef: decision.id,
    selectedActionDigest: decision.selectedActionDigest,
    executionId,
    decisionAt: decision.decisionAt,
    windowOpenedAt: '2026-09-13T09:59:55.000Z',
    interventionDeadlineAt: '2026-09-13T10:00:30.000Z',
    closeReason: 'effect-committed',
    requirement: {
      mode: 'mandatory',
      policyRefs: ['policy:payments:v7'],
    },
    overseer: {
      principalKind: 'human',
      principalRef: `human:risk-officer:${suffix}`,
      identityAttestationRef: `attestation:risk-officer:${suffix}`,
      assignedAt: '2026-09-13T09:00:00.000Z',
      authorityRefs: ['authority:payments:v4'],
      competenceEvidenceRefs: ['credential:risk-review:v2'],
    },
    notice: {
      deliveryStatus: 'acknowledged',
      issuedAt: '2026-09-13T10:00:01.000Z',
      deliveredAt: '2026-09-13T10:00:02.000Z',
      acknowledgedAt: '2026-09-13T10:00:06.000Z',
      channel: 'ops-console',
      evidenceRefs: ['notice-receipt:test'],
    },
    information: {
      bundleDigest: `sha256:${'9'.repeat(64)}`,
      availableAt: '2026-09-13T10:00:02.000Z',
      evidenceRefs: ['evidence:risk-context'],
      forecastRefs: [],
    },
    controls: [
      {
        id: 'control-veto',
        kind: 'veto',
        authorityRef: 'authority:payments:v4',
        enforcementRef: 'finality-sink:payments:v3',
        availableFrom: '2026-09-13T09:59:55.000Z',
        availableUntil: '2026-09-13T10:00:30.000Z',
        scopeDigest: `sha256:${'a'.repeat(64)}`,
        evidenceRefs: ['control-attestation:veto'],
      },
    ],
    fallback: {
      onNoResponse: 'deny',
      enforcementRef: 'finality-sink:payments:v3',
    },
    captureMode: 'contemporaneous',
    capturedAt: '2026-09-13T10:00:10.000Z',
    attestorId: 'payments-governance-kernel',
    attestationRef: `attestation:intervention-frontier:${suffix}`,
    basisDigest: `sha256:${'b'.repeat(64)}`,
    ...overrides,
  };
}

function interventionAttempt(
  id = `intervention_attempt_${suffix}`,
  outcome: InterventionAttemptRecord['outcome'] = 'succeeded',
): InterventionAttemptRecord {
  const oversight = interventionFrontier();
  return {
    version: 'noe.intervention-attempt.v1',
    id,
    frontierId: oversight.id,
    actorId,
    decisionId: oversight.decisionId,
    overseerPrincipalRef: oversight.overseer.principalRef,
    controlId: 'control-veto',
    controlKind: 'veto',
    attemptedAt: '2026-09-13T10:00:10.000Z',
    completedAt: '2026-09-13T10:00:11.000Z',
    outcome,
    attestationRef: `attestation:${id}`,
    evidenceRefs: [`control-result:${id}`],
    basisDigest: `sha256:${'c'.repeat(64)}`,
  };
}

function oversightAssessment(
  id: string,
  evaluatorId: string,
  disposition: OversightEffectivenessAssessment['disposition'],
): OversightEffectivenessAssessment {
  const oversight = interventionFrontier();
  return {
    version: 'noe.oversight-assessment.v1',
    id,
    frontierId: oversight.id,
    actorId,
    decisionId: oversight.decisionId,
    evaluatorId,
    attestationRef: `attestation:${evaluatorId}:${id}`,
    method: 'oversight-opportunity-review',
    methodVersion: '1.0.0',
    dimension: 'overall-opportunity',
    disposition,
    assessedAt: '2026-09-13T12:00:00.000Z',
    attemptRefs: [`intervention_attempt_${suffix}`],
    consequenceObservationRefs: [],
    evidenceRefs: [`audit:${id}`],
    basisDigest: `sha256:${id.padEnd(64, 'd').slice(0, 64)}`,
  };
}

beforeAll(async () => {
  const startedAt = new Date('2026-09-13T09:00:00.000Z');
  await db.host.create({
    data: {
      id: hostId,
      slug: `oversight-${suffix}`,
      displayName: 'Oversight Opportunity Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `oversight-${suffix}`.slice(0, 32),
      displayName: `Oversight Actor ${suffix}`,
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
      model: 'oversight-model-a',
      runtime: 'oversight-runtime-a',
      configHash: `sha256:${'e'.repeat(64)}`,
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

describe('oversight opportunity canonical history', () => {
  it('persists and verifies an Intervention Frontier idempotently', async () => {
    await recordDecisionFrontier(decisionFrontier(), registry);
    const record = interventionFrontier();
    const first = await recordInterventionFrontier(record, registry);
    expect(first.replayed).toBe(false);
    expect(first.event.signature).toBeTruthy();
    expect(first.event.type).toBe('decision.intervention-frontier.recorded');

    const replay = await recordInterventionFrontier(record, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    const stored = await getInterventionFrontier(record.id);
    expect(stored?.record).toEqual(record);

    const listed = await listDecisionInterventionFrontiers(record.decisionFrontierRef);
    expect(listed).not.toBeNull();
    expect(listed).toHaveLength(1);

    await expect(
      verifyOversightOpportunityRecord('frontier', record.id, signingSecret),
    ).resolves.toEqual({ exists: true, eventValid: true, payloadValid: true });
  });

  it('rejects semantic frontier id reuse with changed oversight facts', async () => {
    const changed = interventionFrontier({
      fallback: { onNoResponse: 'allow', enforcementRef: 'finality-sink:payments:v3' },
    });
    await expect(recordInterventionFrontier(changed, registry)).rejects.toThrow(
      /conflicts with canonical history/,
    );
  });

  it('persists an exact historical intervention attempt and verifies it', async () => {
    const record = interventionAttempt();
    const first = await recordInterventionAttempt(record, registry);
    expect(first.replayed).toBe(false);
    expect(first.event.type).toBe('decision.intervention-attempt.recorded');

    const replay = await recordInterventionAttempt(record, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    expect((await getInterventionAttempt(record.id))?.record).toEqual(record);
    expect(await listInterventionAttempts(record.frontierId)).toHaveLength(1);
    await expect(
      verifyOversightOpportunityRecord('attempt', record.id, signingSecret),
    ).resolves.toEqual({ exists: true, eventValid: true, payloadValid: true });
  });

  it('preserves plural evaluator disagreement instead of a universal oversight score', async () => {
    const auditor = oversightAssessment(
      `oversight_assessment_auditor_${suffix}`,
      'independent-auditor',
      'meaningful',
    );
    const insurer = oversightAssessment(
      `oversight_assessment_insurer_${suffix}`,
      'insurer-risk-review',
      'nominal',
    );

    const first = await recordOversightEffectivenessAssessment(auditor, registry);
    const second = await recordOversightEffectivenessAssessment(insurer, registry);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);

    const replay = await recordOversightEffectivenessAssessment(auditor, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    const listed = await listOversightEffectivenessAssessments(auditor.frontierId);
    expect(listed).not.toBeNull();
    expect(listed).toHaveLength(2);
    expect(listed?.map((item) => item.assessment.disposition).sort()).toEqual([
      'meaningful',
      'nominal',
    ]);

    expect((await getOversightEffectivenessAssessment(auditor.id))?.assessment).toEqual(auditor);
    await expect(
      verifyOversightOpportunityRecord('assessment', auditor.id, signingSecret),
    ).resolves.toEqual({ exists: true, eventValid: true, payloadValid: true });
  });

  it('does not rewrite historical oversight after the actor execution changes', async () => {
    const before = await getInterventionFrontier(interventionFrontier().id);
    expect(before).not.toBeNull();

    await db.actorExecution.update({
      where: { id: executionId },
      data: { endedAt: new Date('2026-09-13T13:00:00.000Z') },
    });
    await db.actorExecution.create({
      data: {
        id: `exec_oversight_next_${suffix}`,
        actorId,
        provider: 'mock',
        model: 'oversight-model-b',
        runtime: 'oversight-runtime-b',
        configHash: `sha256:${'f'.repeat(64)}`,
        startedAt: new Date('2026-09-13T13:00:00.000Z'),
      },
    });

    const after = await getInterventionFrontier(interventionFrontier().id);
    expect(after?.record).toEqual(before?.record);
    expect(after?.record.executionId).toBe(executionId);
    expect(after?.event.hash).toBe(before?.event.hash);
  });
});