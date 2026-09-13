import { describe, expect, it } from 'vitest';

import type { DecisionFrontierRecord } from './decision-frontier.js';
import {
  assertForecastMatchesDecisionFrontierCandidate,
  assertValidForeseeabilityAssessment,
  assertValidOutcomeForecastRecord,
  outcomeClassWasExplicitlyForecast,
  probabilityInterval,
  type OutcomeForecastRecord,
} from './foreseeability-provenance.js';

const frontier: DecisionFrontierRecord = {
  version: 'noeone.decision-frontier.v1',
  id: 'frontier_1',
  actorId: 'act_1',
  decisionId: 'decision_1',
  executionId: 'exec_1',
  decisionAt: '2026-09-13T10:00:00.000Z',
  capturedAt: '2026-09-13T10:00:01.000Z',
  completeness: 'bounded-policy-set',
  boundary: {
    environmentStateDigest: 'sha256:state',
    actionSchemaRef: 'schema:payments:v1',
    actionSchemaDigest: 'sha256:schema',
    policyRef: 'policy:payments:v4',
    policyDigest: 'sha256:policy',
  },
  candidates: [
    {
      id: 'candidate_pay',
      actionDigest: 'sha256:pay',
      actionClass: 'payment.transfer',
      parametersDigest: 'sha256:params',
      source: 'policy-engine',
      observedAt: '2026-09-13T09:59:40.000Z',
      availability: 'available',
      policyDisposition: 'permitted',
      effectClass: 'irreversible',
      evidenceRefs: ['evidence:balance'],
    },
    {
      id: 'candidate_escalate',
      actionDigest: 'sha256:escalate',
      actionClass: 'human.escalate',
      parametersDigest: 'sha256:none',
      source: 'human-supervisor',
      observedAt: '2026-09-13T09:59:40.000Z',
      availability: 'available',
      policyDisposition: 'permitted',
      effectClass: 'reversible',
      evidenceRefs: [],
    },
  ],
  selectedActionDigest: 'sha256:pay',
  selectedCandidateId: 'candidate_pay',
  safeDefaultCandidateId: 'candidate_escalate',
  attestor: 'policy-engine',
  attestationRef: 'attestation:frontier',
  candidateSetDigest: 'sha256:candidates',
};

function forecast(): OutcomeForecastRecord {
  return {
    version: 'noeone.outcome-forecast.v1',
    id: 'forecast_1',
    actorId: frontier.actorId,
    decisionId: frontier.decisionId,
    frontierRecordId: frontier.id,
    candidateId: 'candidate_pay',
    actionDigest: 'sha256:pay',
    executionId: 'exec_1',
    forecastAt: '2026-09-13T09:59:55.000Z',
    decisionAt: frontier.decisionAt,
    horizonStartAt: frontier.decisionAt,
    horizonEndAt: '2026-09-14T10:00:00.000Z',
    sourceKind: 'host-risk-engine',
    forecasterId: 'risk_engine_v4',
    attestationRef: 'attestation:risk-engine:forecast_1',
    method: 'transaction-risk-model',
    methodVersion: '4.2.0',
    environmentStateDigest: frontier.boundary.environmentStateDigest,
    epistemicInquiryRef: 'inquiry_1',
    referenceClassRef: 'payments:merchant-risk:2026q3',
    evidence: [
      { ref: 'evidence:balance', observedAt: '2026-09-13T09:59:30.000Z' },
      { ref: 'evidence:merchant', observedAt: '2026-09-13T09:59:35.000Z' },
    ],
    outcomes: [
      {
        id: 'outcome_loss',
        outcomeClass: 'financial-loss',
        taxonomyRef: 'taxonomy:risk:v1',
        probability: { kind: 'interval', lower: 0.02, upper: 0.05 },
        severityScaleRef: 'loss-bands:v1',
        severityLevel: 'material',
        expectedLossMinor: 2500,
        evidenceRefs: ['evidence:merchant'],
      },
      {
        id: 'outcome_success',
        outcomeClass: 'payment-success',
        probability: { kind: 'point', value: 0.93 },
        evidenceRefs: [],
      },
    ],
    residualUnknownRisk: 'acknowledged',
    basisDigest: 'sha256:forecast-basis',
  };
}

describe('foreseeability provenance', () => {
  it('accepts a decision-time forecast bound to a historical frontier candidate', () => {
    const record = forecast();
    expect(() => assertValidOutcomeForecastRecord(record)).not.toThrow();
    expect(() => assertForecastMatchesDecisionFrontierCandidate(record, frontier)).not.toThrow();
    expect(outcomeClassWasExplicitlyForecast(record, 'financial-loss')).toBe(true);
    expect(probabilityInterval(record.outcomes[0]!.probability)).toEqual({ lower: 0.02, upper: 0.05 });
  });

  it('rejects forecasts without verifiable issuer provenance', () => {
    const record = { ...forecast(), attestationRef: '' };
    expect(() => assertValidOutcomeForecastRecord(record)).toThrow(/attestationRef is required/);
  });

  it('rejects hindsight forecasts recorded after the decision', () => {
    const record = { ...forecast(), forecastAt: '2026-09-13T10:00:01.000Z' };
    expect(() => assertValidOutcomeForecastRecord(record)).toThrow(/no later than the decision/);
  });

  it('rejects evidence learned after the forecast', () => {
    const record = forecast();
    record.evidence = [{ ref: 'evidence:future', observedAt: '2026-09-13T09:59:56.000Z' }];
    expect(() => assertValidOutcomeForecastRecord(record)).toThrow(/observed after forecastAt/);
  });

  it('rejects invalid probability intervals', () => {
    const record = forecast();
    record.outcomes = [
      {
        id: 'bad',
        outcomeClass: 'financial-loss',
        probability: { kind: 'interval', lower: 0.8, upper: 0.2 },
        evidenceRefs: [],
      },
    ];
    expect(() => assertValidOutcomeForecastRecord(record)).toThrow(/0 <= lower <= upper <= 1/);
  });

  it('rejects floating-point minor-unit loss values', () => {
    const record = forecast();
    record.outcomes = [
      {
        id: 'bad-money',
        outcomeClass: 'financial-loss',
        probability: { kind: 'point', value: 0.1 },
        expectedLossMinor: 12.5,
        evidenceRefs: [],
      },
    ];
    expect(() => assertValidOutcomeForecastRecord(record)).toThrow(/safe integer/);
  });

  it('rejects a forecast substituted onto another candidate', () => {
    const record = { ...forecast(), candidateId: 'candidate_escalate' };
    expect(() => assertForecastMatchesDecisionFrontierCandidate(record, frontier)).toThrow(
      /actionDigest does not match/,
    );
  });

  it('keeps later foreseeability judgments evaluator-specific', () => {
    const base = {
      version: 'noeone.foreseeability-assessment.v1' as const,
      actorId: frontier.actorId,
      decisionId: frontier.decisionId,
      consequenceObservationRef: 'consequence_1',
      attestationRef: 'attestation:assessment:base',
      method: 'negligence-analysis',
      methodVersion: '1.0',
      dimension: 'kind-of-harm' as const,
      forecastRecordRefs: ['forecast_1'],
      decisionFrontierRef: frontier.id,
      assessedAt: '2026-09-14T12:00:00.000Z',
      evidenceRefs: ['evidence:loss'],
      basisDigest: 'sha256:assessment',
    };

    expect(() =>
      assertValidForeseeabilityAssessment(
        {
          ...base,
          id: 'a1',
          evaluatorId: 'insurer',
          attestationRef: 'attestation:insurer:a1',
          disposition: 'foreseeable',
        },
        frontier.decisionAt,
      ),
    ).not.toThrow();
    expect(() =>
      assertValidForeseeabilityAssessment(
        {
          ...base,
          id: 'a2',
          evaluatorId: 'court-expert',
          attestationRef: 'attestation:court:a2',
          disposition: 'indeterminate',
        },
        frontier.decisionAt,
      ),
    ).not.toThrow();
  });
});
