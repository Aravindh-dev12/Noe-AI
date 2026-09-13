import { describe, expect, it } from 'vitest';

import {
  assertValidAlternativeActionAssessment,
  assertValidCounterfactualTrial,
  assertValidDecisionFrontierRecord,
  classifyCandidateExecutionEligibility,
  counterfactualTrialUsesHistoricalState,
  decisionFrontierSupportsNonOmissionClaim,
  listHistoricalAlternatives,
  type DecisionFrontierRecord,
} from './decision-frontier.js';

function baseFrontier(): DecisionFrontierRecord {
  return {
    version: 'noeone.decision-frontier.v1',
    id: 'frontier_1',
    actorId: 'act_1',
    decisionId: 'decision_1',
    executionId: 'exec_1',
    decisionAt: '2026-09-13T10:00:00.000Z',
    capturedAt: '2026-09-13T10:00:00.500Z',
    completeness: 'exhaustive-within-declared-boundary',
    boundary: {
      environmentStateDigest: 'sha256:state',
      actionSchemaRef: 'env:triad:v1:legal-actions',
      actionSchemaDigest: 'sha256:schema',
      enforcementRef: 'runtime-shield:triad-v1',
      policyRef: 'policy:competition-v1',
      policyDigest: 'sha256:policy',
      toolCatalogDigest: 'sha256:tools',
      authoritySnapshotRef: 'authority:snapshot:1',
      epistemicInquiryRef: 'inq_1',
    },
    candidates: [
      {
        id: 'candidate_play_a',
        actionDigest: 'sha256:play-a',
        actionClass: 'triad.play',
        parametersDigest: 'sha256:a',
        source: 'environment',
        observedAt: '2026-09-13T09:59:59.900Z',
        availability: 'available',
        policyDisposition: 'permitted',
        effectClass: 'reversible',
        evidenceRefs: ['host-action-set:1'],
      },
      {
        id: 'candidate_play_b',
        actionDigest: 'sha256:play-b',
        actionClass: 'triad.play',
        parametersDigest: 'sha256:b',
        source: 'environment',
        observedAt: '2026-09-13T09:59:59.900Z',
        availability: 'available',
        policyDisposition: 'permitted',
        effectClass: 'reversible',
        evidenceRefs: ['host-action-set:1'],
      },
      {
        id: 'candidate_abstain',
        actionDigest: 'sha256:abstain',
        actionClass: 'triad.abstain',
        parametersDigest: 'sha256:none',
        source: 'environment',
        observedAt: '2026-09-13T09:59:59.900Z',
        availability: 'available',
        policyDisposition: 'conditional',
        effectClass: 'reversible',
        approvalRef: 'approval:supervisor',
        evidenceRefs: ['host-action-set:1'],
      },
    ],
    selectedActionDigest: 'sha256:play-a',
    selectedCandidateId: 'candidate_play_a',
    safeDefaultCandidateId: 'candidate_abstain',
    attestor: 'host',
    attestationRef: 'host-frontier-signature:1',
    candidateSetDigest: 'sha256:candidate-set',
  };
}

describe('decision frontier evidence', () => {
  it('validates an externally enforced exhaustive frontier', () => {
    const frontier = baseFrontier();
    expect(() => assertValidDecisionFrontierRecord(frontier)).not.toThrow();
    expect(decisionFrontierSupportsNonOmissionClaim(frontier)).toBe(true);
    expect(listHistoricalAlternatives(frontier).map((item) => item.id)).toEqual([
      'candidate_play_b',
      'candidate_abstain',
    ]);
  });

  it('rejects candidates inserted after the historical decision', () => {
    const withoutSafeDefault = { ...baseFrontier() };
    delete withoutSafeDefault.safeDefaultCandidateId;
    const frontier: DecisionFrontierRecord = {
      ...withoutSafeDefault,
      candidates: [
        {
          ...baseFrontier().candidates[0]!,
          observedAt: '2026-09-13T10:00:01.000Z',
        },
      ],
      selectedCandidateId: 'candidate_play_a',
    };

    expect(() => assertValidDecisionFrontierRecord(frontier)).toThrow(/observed after the decision/);
  });

  it('rejects a selected candidate whose digest does not match the executed action', () => {
    const frontier: DecisionFrontierRecord = {
      ...baseFrontier(),
      selectedActionDigest: 'sha256:different-action',
    };

    expect(() => assertValidDecisionFrontierRecord(frontier)).toThrow(/does not match/);
  });

  it('does not allow an agent self-report to establish an exhaustive frontier', () => {
    const frontier: DecisionFrontierRecord = {
      ...baseFrontier(),
      attestor: 'agent-self-report',
    };

    expect(() => assertValidDecisionFrontierRecord(frontier)).toThrow(/self-report cannot establish/);
  });

  it('forces sampled frontiers to disclose their generator and rejects non-omission claims', () => {
    const invalid: DecisionFrontierRecord = {
      ...baseFrontier(),
      completeness: 'sampled',
      boundary: {
        ...baseFrontier().boundary,
      },
      attestor: 'runtime',
    };

    expect(() => assertValidDecisionFrontierRecord(invalid)).toThrow(/generatorMethodRef/);

    const valid: DecisionFrontierRecord = {
      ...invalid,
      boundary: {
        ...invalid.boundary,
        generatorMethodRef: 'planner:mcts:v3',
      },
    };
    expect(() => assertValidDecisionFrontierRecord(valid)).not.toThrow();
    expect(decisionFrontierSupportsNonOmissionClaim(valid)).toBe(false);
  });

  it('keeps availability and authorization separate when deriving execution eligibility', () => {
    const frontier = baseFrontier();
    expect(classifyCandidateExecutionEligibility(frontier.candidates[0]!)).toBe(
      'directly-executable',
    );
    expect(classifyCandidateExecutionEligibility(frontier.candidates[2]!)).toBe('conditional');

    expect(
      classifyCandidateExecutionEligibility({
        ...frontier.candidates[1]!,
        availability: 'unavailable',
      }),
    ).toBe('blocked');

    expect(
      classifyCandidateExecutionEligibility({
        ...frontier.candidates[1]!,
        availability: 'unknown',
      }),
    ).toBe('indeterminate');
  });

  it('keeps later counterfactual trials separate and exposes state drift', () => {
    const frontier = baseFrontier();
    const exactTrial = {
      version: 'noeone.counterfactual-trial.v1' as const,
      id: 'trial_exact',
      frontierRecordId: frontier.id,
      candidateId: 'candidate_play_b',
      evaluatorId: 'lab-a',
      method: 'deterministic-replay',
      methodVersion: '1',
      trialKind: 'exact-replay' as const,
      environmentStateDigest: frontier.boundary.environmentStateDigest,
      inputEvidenceRefs: ['trajectory:1'],
      outputEvidenceRefs: ['trajectory:replay:1'],
      outcomeDigest: 'sha256:outcome-b',
      performedAt: '2026-09-13T11:00:00.000Z',
    };

    expect(() => assertValidCounterfactualTrial(exactTrial, frontier)).not.toThrow();
    expect(counterfactualTrialUsesHistoricalState(exactTrial, frontier)).toBe(true);

    const changedStateTrial = {
      ...exactTrial,
      id: 'trial_changed',
      environmentStateDigest: 'sha256:later-state',
    };
    expect(() => assertValidCounterfactualTrial(changedStateTrial, frontier)).not.toThrow();
    expect(counterfactualTrialUsesHistoricalState(changedStateTrial, frontier)).toBe(false);
  });

  it('allows evaluators to disagree about whether an alternative was materially feasible or safer', () => {
    const frontier = baseFrontier();
    const strict = {
      version: 'noeone.alternative-action-assessment.v1' as const,
      id: 'assessment_strict',
      frontierRecordId: frontier.id,
      candidateId: 'candidate_abstain',
      evaluatorId: 'insurer-a',
      method: 'safety-policy-review',
      methodVersion: '2',
      feasibility: 'supported' as const,
      comparativeSafety: 'safer' as const,
      assessedAt: '2026-09-13T12:00:00.000Z',
      evidenceRefs: ['frontier:1', 'incident:1'],
      basisDigest: 'sha256:basis-a',
    };

    const disputed = {
      ...strict,
      id: 'assessment_disputed',
      evaluatorId: 'operator-b',
      feasibility: 'disputed' as const,
      comparativeSafety: 'indeterminate' as const,
      basisDigest: 'sha256:basis-b',
    };

    expect(() => assertValidAlternativeActionAssessment(strict, frontier)).not.toThrow();
    expect(() => assertValidAlternativeActionAssessment(disputed, frontier)).not.toThrow();
  });

  it('rejects counterfactual work that references an alternative not in the historical frontier', () => {
    const frontier = baseFrontier();
    const trial = {
      version: 'noeone.counterfactual-trial.v1' as const,
      id: 'trial_hindsight',
      frontierRecordId: frontier.id,
      candidateId: 'candidate_invented_afterward',
      evaluatorId: 'lab-a',
      method: 'search',
      methodVersion: '1',
      trialKind: 'search' as const,
      environmentStateDigest: frontier.boundary.environmentStateDigest,
      inputEvidenceRefs: [],
      outputEvidenceRefs: ['repair:1'],
      outcomeDigest: 'sha256:repair',
      performedAt: '2026-09-13T13:00:00.000Z',
    };

    expect(() => assertValidCounterfactualTrial(trial, frontier)).toThrow(/unknown candidate/);
  });
});
