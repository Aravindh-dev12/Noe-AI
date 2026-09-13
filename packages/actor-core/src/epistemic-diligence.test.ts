import assert from 'node:assert/strict';
import test from 'node:test';

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

test('completed authoritative verification satisfies the requirement', () => {
  const record = baseRecord();
  assertValidDecisionInquiryRecord(record);

  const coverage = deriveDecisionInquiryCoverage(record);
  assert.equal(coverage.mandatorySatisfied, 1);
  assert.equal(coverage.mandatoryTotal, 1);
  assert.equal(coverage.hasMissedAvailableCheck, false);
  assert.equal(coverage.requirements[0]?.disposition, 'satisfied');
});

test('available but skipped verification is distinguished from an unavoidable information gap', () => {
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

  assert.equal(
    classifyRequirementCoverage(skipped, requirement).disposition,
    'missed-available-check',
  );
  assert.equal(
    classifyRequirementCoverage(unavailable, requirement).disposition,
    'attested-unavailable',
  );
});

test('agent self-report does not establish a runtime-attested verification opportunity when policy excludes it', () => {
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
  assert.equal(coverage.disposition, 'indeterminate');
  assert.deepEqual(coverage.matchedOpportunityIds, []);
});

test('failed use of an available verifier is different from never trying it', () => {
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
  assert.equal(coverage.requirements[0]?.disposition, 'attempted-but-unresolved');
  assert.equal(coverage.hasMissedAvailableCheck, false);
});

test('unknown opportunity state remains indeterminate rather than becoming a negligence inference', () => {
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

  assert.equal(
    classifyRequirementCoverage(record, requirement).disposition,
    'indeterminate',
  );
});

test('completed attempts must be backed by referenced evidence', () => {
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

  assert.throws(
    () => assertValidDecisionInquiryRecord(record),
    /Completed attempt attempt_bank_verify must reference evidence/,
  );
});

test('attempts cannot fabricate unknown requirements or opportunities', () => {
  const unknownRequirement: DecisionInquiryRecord = {
    ...baseRecord(),
    attempts: [
      {
        ...baseRecord().attempts[0]!,
        requirementId: 'req_unknown',
      },
    ],
  };
  assert.throws(
    () => assertValidDecisionInquiryRecord(unknownRequirement),
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
  assert.throws(
    () => assertValidDecisionInquiryRecord(unknownOpportunity),
    /references unknown opportunity/,
  );
});

test('independent evaluators may reach different diligence assessments without rewriting the record', () => {
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

  assert.doesNotThrow(() => assertValidEpistemicDiligenceAssessment(strictAssessment, record));
  assert.doesNotThrow(() => assertValidEpistemicDiligenceAssessment(permissiveAssessment, record));
  assert.equal(record.id, 'inq_1');
});
