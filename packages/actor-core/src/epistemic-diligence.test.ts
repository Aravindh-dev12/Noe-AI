import { describe, expect, it } from 'vitest';

import {
  assertValidDecisionInquiryRecord,
  assertValidEpistemicDiligenceAssessment,
  classifyRequirementCoverage,
  deriveDecisionInquiryCoverage,
  type DecisionInquiryRecord,
  type EpistemicDiligenceRequirement,
} from './epistemic-diligence.js';

const requirement: EpistemicDiligenceRequirement = {
  id: 'req_authoritative_verify',
  description: 'Consult an authoritative source before the consequential action.',
  mandatory: true,
  capabilityKinds: ['authoritative-fact-check'],
  acceptedSourceClasses: ['authoritative-source'],
  acceptedOpportunityAttestors: ['runtime', 'host'],
  maxEvidenceAgeSeconds: 300,
};

function baseRecord(): DecisionInquiryRecord {
  return {
    version: 'noeone.decision-inquiry-record.v1',
    id: 'inq_1',
    actorId: 'act_1',
    decisionId: 'decision_1',
    executionId: 'exec_1',
    actionRef: 'action_1',
    decisionAt: '2026-09-13T10:00:00.000Z',
    recordedAt: '2026-09-13T10:00:01.000Z',
    riskTier: 'critical',
    policy: {
      id: 'policy_payments',
      version: '3',
      digest: 'sha256:policy',
    },
    opportunities: [
      {
        id: 'opp_bank_verify',
        capabilityKind: 'authoritative-fact-check',
        sourceClass: 'authoritative-source',
        status: 'available',
        attestor: 'runtime',
        attestationRef: 'runtime-snapshot:123',
        observedAt: '2026-09-13T09:59:50.000Z',
      },
    ],
    requirements: [requirement],
    attempts: [
      {
        id: 'attempt_bank_verify',
        requirementId: requirement.id,
        opportunityId: 'opp_bank_verify',
        outcome: 'completed',
        startedAt: '2026-09-13T09:59:52.000Z',
        finishedAt: '2026-09-13T09:59:55.000Z',
        evidenceRefs: ['ev_bank'],
      },
    ],
    evidenceUsed: [
      {
        id: 'ev_bank',
        sourceRef: 'bank-api:balance-check:123',
        digest: 'sha256:evidence',
        sourceClass: 'authoritative-source',
        observedAt: '2026-09-13T09:59:55.000Z',
      },
    ],
    unresolvedConflicts: [],
    constraints: {
      timeBudgetMs: 30_000,
      networkAccess: 'available',
      humanEscalation: 'available',
    },
    evidenceBundleRef: 'bundle:decision_1',
  };
}

describe('epistemic diligence evidence', () => {
  it('treats completed authoritative verification as satisfying the requirement', () => {
    const record = baseRecord();
    expect(() => assertValidDecisionInquiryRecord(record)).not.toThrow();

    const coverage = deriveDecisionInquiryCoverage(record);
    expect(coverage.mandatorySatisfied).toBe(1);
    expect(coverage.mandatoryTotal).toBe(1);
    expect(coverage.hasMissedAvailableCheck).toBe(false);
    expect(coverage.requirements[0]?.disposition).toBe('satisfied');
  });

  it('distinguishes available-but-skipped verification from an attested information gap', () => {
    const skipped: DecisionInquiryRecord = {
      ...baseRecord(),
      attempts: [
        {
          id: 'attempt_skip',
          requirementId: requirement.id,
          opportunityId: 'opp_bank_verify',
          outcome: 'skipped',
          startedAt: '2026-09-13T09:59:52.000Z',
          evidenceRefs: [],
          reasonCode: 'agent-chose-not-to-query',
        },
      ],
      evidenceUsed: [],
    };

    const unavailable: DecisionInquiryRecord = {
      ...baseRecord(),
      id: 'inq_2',
      opportunities: [
        {
          ...baseRecord().opportunities[0]!,
          status: 'unavailable',
          constraintCode: 'provider-outage',
        },
      ],
      attempts: [],
      evidenceUsed: [],
    };

    expect(classifyRequirementCoverage(skipped, requirement).disposition).toBe(
      'missed-available-check',
    );
    expect(classifyRequirementCoverage(unavailable, requirement).disposition).toBe(
      'attested-unavailable',
    );
  });

  it('does not treat excluded agent self-report as an attested verification opportunity', () => {
    const record: DecisionInquiryRecord = {
      ...baseRecord(),
      opportunities: [
        {
          ...baseRecord().opportunities[0]!,
          attestor: 'agent-self-report',
        },
      ],
      attempts: [],
      evidenceUsed: [],
    };

    const coverage = classifyRequirementCoverage(record, requirement);
    expect(coverage.disposition).toBe('indeterminate');
    expect(coverage.matchedOpportunityIds).toEqual([]);
  });

  it('distinguishes failed use of an available verifier from never trying it', () => {
    const record: DecisionInquiryRecord = {
      ...baseRecord(),
      attempts: [
        {
          id: 'attempt_failed',
          requirementId: requirement.id,
          opportunityId: 'opp_bank_verify',
          outcome: 'failed',
          startedAt: '2026-09-13T09:59:52.000Z',
          finishedAt: '2026-09-13T09:59:54.000Z',
          evidenceRefs: [],
          reasonCode: 'upstream-500',
        },
      ],
      evidenceUsed: [],
    };

    const coverage = deriveDecisionInquiryCoverage(record);
    expect(coverage.requirements[0]?.disposition).toBe('attempted-but-unresolved');
    expect(coverage.hasMissedAvailableCheck).toBe(false);
  });

  it('keeps unknown opportunity state indeterminate instead of inferring negligence', () => {
    const record: DecisionInquiryRecord = {
      ...baseRecord(),
      opportunities: [
        {
          ...baseRecord().opportunities[0]!,
          status: 'unknown',
        },
      ],
      attempts: [],
      evidenceUsed: [],
    };

    expect(classifyRequirementCoverage(record, requirement).disposition).toBe('indeterminate');
  });

  it('requires evidence for completed verification attempts', () => {
    const record: DecisionInquiryRecord = {
      ...baseRecord(),
      attempts: [
        {
          ...baseRecord().attempts[0]!,
          evidenceRefs: [],
        },
      ],
      evidenceUsed: [],
    };

    expect(() => assertValidDecisionInquiryRecord(record)).toThrow(
      /Completed attempt attempt_bank_verify must reference evidence/,
    );
  });

  it('rejects attempts that fabricate unknown requirements or opportunities', () => {
    const unknownRequirement: DecisionInquiryRecord = {
      ...baseRecord(),
      attempts: [
        {
          ...baseRecord().attempts[0]!,
          requirementId: 'req_unknown',
        },
      ],
    };
    expect(() => assertValidDecisionInquiryRecord(unknownRequirement)).toThrow(
      /references unknown requirement/,
    );

    const unknownOpportunity: DecisionInquiryRecord = {
      ...baseRecord(),
      attempts: [
        {
          ...baseRecord().attempts[0]!,
          opportunityId: 'opp_unknown',
        },
      ],
    };
    expect(() => assertValidDecisionInquiryRecord(unknownOpportunity)).toThrow(
      /references unknown opportunity/,
    );
  });

  it('allows independent evaluators to disagree without rewriting the record', () => {
    const record = baseRecord();

    const strictAssessment = {
      version: 'noeone.epistemic-diligence-assessment.v1' as const,
      id: 'assessment_strict',
      decisionInquiryRecordId: record.id,
      evaluatorId: 'insurer-a',
      policyId: 'insurer-a-vetting',
      policyVersion: '1',
      disposition: 'insufficient' as const,
      assessedAt: '2026-09-13T11:00:00.000Z',
      evidenceRefs: [record.evidenceBundleRef],
      rationaleCode: 'human-review-required',
    };

    const permissiveAssessment = {
      ...strictAssessment,
      id: 'assessment_permissive',
      evaluatorId: 'host-b',
      policyId: 'host-b-vetting',
      disposition: 'sufficient' as const,
      rationaleCode: 'authoritative-check-satisfied',
    };

    expect(() => assertValidEpistemicDiligenceAssessment(strictAssessment, record)).not.toThrow();
    expect(() =>
      assertValidEpistemicDiligenceAssessment(permissiveAssessment, record),
    ).not.toThrow();
    expect(record.id).toBe('inq_1');
  });
});
