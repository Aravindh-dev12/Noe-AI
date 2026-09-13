import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DecisionFrontierRecord,
  ForeseeabilityAssessment,
  OutcomeForecastRecord,
} from '@onbae/actor-core';

import {
  db,
  getDecisionFrontier,
  getForeseeabilityAssessment,
  getOutcomeForecast,
  listDecisionForeseeabilityAssessments,
  listDecisionOutcomeForecasts,
  recordConsequenceObservation,
  recordDecisionFrontier,
  recordForeseeabilityAssessment,
  recordOutcomeForecast,
  registerEvidenceReference,
  verifyDecisionForeseeabilityRecord,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_foreseeability_${suffix}`;
const actorId = `act_foreseeability_${suffix}`;
const executionId = `exec_foreseeability_${suffix}`;
const nextExecutionId = `exec_foreseeability_next_${suffix}`;
const lineageId = `lin_foreseeability_${suffix}`;
const signingSecret = 'test-foreseeability-signing-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-foreseeability@test',
  issuer: 'noeone-test',
} as const;

const evidenceArtifactIds: string[] = [];
let consequenceId = '';

function frontier(id = `frontier_${suffix}`): DecisionFrontierRecord {
  return {
    version: 'noeone.decision-frontier.v1',
    id,
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
      policyRef: 'policy:payments:v7',
      policyDigest: `sha256:${'3'.repeat(64)}`,
      epistemicInquiryRef: `inquiry_${suffix}`,
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
    attestationRef: `attestation:${suffix}`,
    candidateSetDigest: `sha256:${'8'.repeat(64)}`,
  };
}

function forecast(
  id = `forecast_${suffix}`,
  forecasterId = 'host-risk-engine-v4',
): OutcomeForecastRecord {
  const decision = frontier();
  return {
    version: 'noeone.outcome-forecast.v1',
    id,
    actorId,
    decisionId: decision.decisionId,
    frontierRecordId: decision.id,
    candidateId: 'candidate-transfer',
    actionDigest: `sha256:${'4'.repeat(64)}`,
    executionId,
    forecastAt: '2026-09-13T09:59:55.000Z',
    decisionAt: decision.decisionAt,
    horizonStartAt: decision.decisionAt,
    horizonEndAt: '2026-09-14T10:00:00.000Z',
    sourceKind: 'host-risk-engine',
    forecasterId,
    method: 'transaction-risk-model',
    methodVersion: '4.2.0',
    environmentStateDigest: decision.boundary.environmentStateDigest,
    epistemicInquiryRef: `inquiry_${suffix}`,
    referenceClassRef: 'payments:merchant-risk:2026q3',
    evidence: [
      {
        ref: 'evidence:merchant-risk',
        observedAt: '2026-09-13T09:59:30.000Z',
      },
    ],
    outcomes: [
      {
        id: 'financial-loss',
        outcomeClass: 'financial-loss',
        taxonomyRef: 'taxonomy:risk:v1',
        probability: { kind: 'interval', lower: 0.02, upper: 0.05 },
        severityScaleRef: 'loss-bands:v1',
        severityLevel: 'material',
        expectedLossMinor: 2500,
        evidenceRefs: ['evidence:merchant-risk'],
      },
      {
        id: 'payment-success',
        outcomeClass: 'payment-success',
        probability: { kind: 'point', value: 0.93 },
        evidenceRefs: [],
      },
    ],
    residualUnknownRisk: 'acknowledged',
    basisDigest: `sha256:${'9'.repeat(64)}`,
  };
}

function assessment(
  id: string,
  evaluatorId: string,
  disposition: ForeseeabilityAssessment['disposition'],
): ForeseeabilityAssessment {
  const decision = frontier();
  return {
    version: 'noeone.foreseeability-assessment.v1',
    id,
    actorId,
    decisionId: decision.decisionId,
    consequenceObservationRef: consequenceId,
    evaluatorId,
    method: 'foreseeability-review',
    methodVersion: '1.0.0',
    dimension: 'kind-of-harm',
    disposition,
    forecastRecordRefs: [`forecast_${suffix}`],
    decisionFrontierRef: decision.id,
    epistemicInquiryRef: `inquiry_${suffix}`,
    assessedAt: '2026-09-13T12:30:00.000Z',
    evidenceRefs: ['incident-report:test'],
    basisDigest: `sha256:${id.padEnd(64, 'a').slice(0, 64)}`,
  };
}

beforeAll(async () => {
  const startedAt = new Date('2026-09-13T09:00:00.000Z');
  await db.host.create({
    data: {
      id: hostId,
      slug: `foreseeability-${suffix}`,
      displayName: 'Foreseeability Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `fore-${suffix}`.slice(0, 32),
      displayName: `Foreseeability Actor ${suffix}`,
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
      model: 'forecast-model-a',
      runtime: 'forecast-runtime-a',
      configHash: `sha256:${'a'.repeat(64)}`,
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

  const evidence = await registerEvidenceReference(
    {
      actorId,
      role: 'outcome-subject',
      kind: 'incident-record',
      issuer: `incident-test-${suffix}`,
      externalId: `incident-${suffix}`,
      digest: `sha256:${'b'.repeat(64)}`,
      observedAt: new Date('2026-09-13T12:00:00.000Z'),
    },
    registry,
  );
  evidenceArtifactIds.push(evidence.artifact.id);

  const consequence = await recordConsequenceObservation({
    kind: 'financial-loss',
    sourceEvidenceArtifactId: evidence.artifact.id,
    occurredAt: new Date('2026-09-13T12:00:00.000Z'),
    valueMinor: '2500',
    currency: 'USD',
    externalFramework: 'test-incident',
    externalReference: `loss:${suffix}`,
    idempotencyKey: `foreseeability-consequence-${suffix}`,
  });
  consequenceId = consequence.observation.id;
});

afterAll(async () => {
  await db.consequenceObservation.deleteMany({ where: { id: consequenceId } });
  await db.actorEvidenceBinding.deleteMany({ where: { actorId } });
  if (evidenceArtifactIds.length > 0) {
    await db.evidenceValidation.deleteMany({
      where: { evidenceArtifactId: { in: evidenceArtifactIds } },
    });
    await db.evidenceArtifact.deleteMany({ where: { id: { in: evidenceArtifactIds } } });
  }
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('decision frontier and foreseeability canonical ledger', () => {
  it('persists and verifies a decision frontier idempotently', async () => {
    const record = frontier();
    const first = await recordDecisionFrontier(record, registry);
    expect(first.replayed).toBe(false);
    expect(first.event.signature).toBeTruthy();
    expect(first.event.type).toBe('decision.frontier.recorded');

    const replay = await recordDecisionFrontier(record, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    const stored = await getDecisionFrontier(record.id);
    expect(stored?.record).toEqual(record);

    const verification = await verifyDecisionForeseeabilityRecord(
      'frontier',
      record.id,
      signingSecret,
    );
    expect(verification).toEqual({ exists: true, eventValid: true, payloadValid: true });
  });

  it('rejects semantic frontier id reuse with changed content', async () => {
    const changed: DecisionFrontierRecord = {
      ...frontier(),
      selectedActionDigest: `sha256:${'6'.repeat(64)}`,
      selectedCandidateId: 'candidate-escalate',
    };
    await expect(recordDecisionFrontier(changed, registry)).rejects.toThrow(/conflicts with canonical history/);
  });

  it('persists candidate-bound ex-ante forecasts and rejects substitution', async () => {
    const first = await recordOutcomeForecast(forecast(), registry);
    expect(first.replayed).toBe(false);
    expect(first.event.type).toBe('decision.outcome-forecast.recorded');

    const replay = await recordOutcomeForecast(forecast(), registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    const independent = await recordOutcomeForecast(
      forecast(`forecast_independent_${suffix}`, 'independent-risk-lab'),
      registry,
    );
    expect(independent.replayed).toBe(false);

    const forecasts = await listDecisionOutcomeForecasts(frontier().id);
    expect(forecasts).not.toBeNull();
    expect(forecasts).toHaveLength(2);

    const stored = await getOutcomeForecast(forecast().id);
    expect(stored?.record.forecasterId).toBe('host-risk-engine-v4');
    expect(
      await verifyDecisionForeseeabilityRecord('forecast', forecast().id, signingSecret),
    ).toEqual({ exists: true, eventValid: true, payloadValid: true });

    const substituted: OutcomeForecastRecord = {
      ...forecast(`forecast_substitution_${suffix}`),
      candidateId: 'candidate-escalate',
    };
    await expect(recordOutcomeForecast(substituted, registry)).rejects.toThrow(
      /actionDigest does not match/,
    );
  });

  it('preserves plural later foreseeability judgments over one observed consequence', async () => {
    const insurer = assessment(`assessment_insurer_${suffix}`, 'insurer-a', 'foreseeable');
    const auditor = assessment(`assessment_auditor_${suffix}`, 'independent-auditor', 'indeterminate');

    const first = await recordForeseeabilityAssessment(insurer, registry);
    const second = await recordForeseeabilityAssessment(auditor, registry);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);

    const replay = await recordForeseeabilityAssessment(insurer, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);

    const assessments = await listDecisionForeseeabilityAssessments(frontier().id);
    expect(assessments).not.toBeNull();
    expect(assessments).toHaveLength(2);
    expect(assessments?.map((entry) => entry.assessment.disposition)).toEqual([
      'foreseeable',
      'indeterminate',
    ]);

    const stored = await getForeseeabilityAssessment(insurer.id);
    expect(stored?.assessment.evaluatorId).toBe('insurer-a');
    expect(
      await verifyDecisionForeseeabilityRecord('assessment', insurer.id, signingSecret),
    ).toEqual({ exists: true, eventValid: true, payloadValid: true });
  });

  it('does not reinterpret historical forecasts after a model/runtime migration', async () => {
    const migratedAt = new Date('2026-09-13T14:00:00.000Z');
    await db.actorExecution.update({
      where: { id: executionId },
      data: { endedAt: migratedAt },
    });
    await db.actorExecution.create({
      data: {
        id: nextExecutionId,
        actorId,
        provider: 'mock',
        model: 'forecast-model-b',
        runtime: 'forecast-runtime-b',
        configHash: `sha256:${'d'.repeat(64)}`,
        startedAt: migratedAt,
      },
    });

    const oldForecast = await getOutcomeForecast(forecast().id);
    expect(oldForecast?.record.executionId).toBe(executionId);
    expect(
      await verifyDecisionForeseeabilityRecord('forecast', forecast().id, signingSecret),
    ).toEqual({ exists: true, eventValid: true, payloadValid: true });
  });
});
