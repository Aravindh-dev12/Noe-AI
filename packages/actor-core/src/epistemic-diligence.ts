export type EpistemicRiskTier = 'low' | 'moderate' | 'high' | 'critical';

export type VerificationSourceClass =
  | 'authoritative-source'
  | 'independent-source'
  | 'formal-verifier'
  | 'human-expert'
  | 'peer-agent'
  | 'same-generator'
  | 'other';

export type OpportunityStatus = 'available' | 'unavailable' | 'unknown';
export type OpportunityAttestor =
  | 'runtime'
  | 'host'
  | 'principal'
  | 'external-auditor'
  | 'agent-self-report';

export type VerificationAttemptOutcome =
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'timed-out'
  | 'skipped';

export type RequirementCoverageDisposition =
  | 'satisfied'
  | 'missed-available-check'
  | 'attempted-but-unresolved'
  | 'attested-unavailable'
  | 'indeterminate';

export type DiligenceAssessmentDisposition =
  | 'sufficient'
  | 'insufficient'
  | 'indeterminate'
  | 'disputed';

export type VerificationOpportunity = {
  id: string;
  capabilityKind: string;
  sourceClass: VerificationSourceClass;
  status: OpportunityStatus;
  attestor: OpportunityAttestor;
  attestationRef: string;
  observedAt: string;
  validFrom?: string;
  validUntil?: string;
  constraintCode?: string;
};

export type EpistemicDiligenceRequirement = {
  id: string;
  description: string;
  mandatory: boolean;
  capabilityKinds: readonly string[];
  acceptedSourceClasses: readonly VerificationSourceClass[];
  acceptedOpportunityAttestors: readonly OpportunityAttestor[];
  maxEvidenceAgeSeconds?: number;
};

export type VerificationAttempt = {
  id: string;
  requirementId: string;
  opportunityId: string;
  outcome: VerificationAttemptOutcome;
  startedAt: string;
  finishedAt?: string;
  evidenceRefs: readonly string[];
  reasonCode?: string;
};

export type DecisionEvidenceReference = {
  id: string;
  sourceRef: string;
  digest: string;
  sourceClass: VerificationSourceClass;
  observedAt: string;
  provenanceRootRef?: string;
};

export type DecisionConstraintSnapshot = {
  timeBudgetMs?: number;
  monetaryBudgetMinor?: number;
  networkAccess: 'available' | 'restricted' | 'unavailable' | 'unknown';
  humanEscalation: 'available' | 'restricted' | 'unavailable' | 'unknown';
  notes?: readonly string[];
};

export type UnresolvedEvidenceConflict = {
  id: string;
  evidenceRefs: readonly string[];
  detectedAt: string;
  status: 'unresolved' | 'escalated' | 'accepted-risk';
};

/**
 * External, reconstructable decision-time inquiry facts. This deliberately
 * excludes hidden chain-of-thought and retrospective natural-language
 * explanations from the model.
 */
export type DecisionInquiryRecord = {
  version: 'noeone.decision-inquiry-record.v1';
  id: string;
  actorId: string;
  decisionId: string;
  executionId?: string;
  actionRef?: string;
  decisionAt: string;
  recordedAt: string;
  riskTier: EpistemicRiskTier;
  policy: {
    id: string;
    version: string;
    digest: string;
  };
  opportunities: readonly VerificationOpportunity[];
  requirements: readonly EpistemicDiligenceRequirement[];
  attempts: readonly VerificationAttempt[];
  evidenceUsed: readonly DecisionEvidenceReference[];
  unresolvedConflicts: readonly UnresolvedEvidenceConflict[];
  constraints: DecisionConstraintSnapshot;
  evidenceBundleRef: string;
};

export type RequirementCoverage = {
  requirementId: string;
  disposition: RequirementCoverageDisposition;
  matchedOpportunityIds: readonly string[];
  successfulAttemptIds: readonly string[];
  unresolvedAttemptIds: readonly string[];
};

export type DecisionInquiryCoverage = {
  recordId: string;
  requirements: readonly RequirementCoverage[];
  mandatorySatisfied: number;
  mandatoryTotal: number;
  hasMissedAvailableCheck: boolean;
  hasUnresolvedEvidenceConflict: boolean;
};

export type EpistemicDiligenceAssessment = {
  version: 'noeone.epistemic-diligence-assessment.v1';
  id: string;
  decisionInquiryRecordId: string;
  evaluatorId: string;
  policyId: string;
  policyVersion: string;
  disposition: DiligenceAssessmentDisposition;
  assessedAt: string;
  evidenceRefs: readonly string[];
  rationaleCode: string;
};

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp.`);
  return parsed;
}

function assertUniqueIds(values: readonly { id: string }[], field: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value.id, `${field}.id`);
    if (ids.has(value.id)) throw new Error(`Duplicate ${field} id: ${value.id}`);
    ids.add(value.id);
  }
}

export function assertValidDecisionInquiryRecord(record: DecisionInquiryRecord): void {
  if (record.version !== 'noeone.decision-inquiry-record.v1') {
    throw new Error('Unsupported decision inquiry record version.');
  }

  assertNonEmpty(record.id, 'id');
  assertNonEmpty(record.actorId, 'actorId');
  assertNonEmpty(record.decisionId, 'decisionId');
  assertNonEmpty(record.policy.id, 'policy.id');
  assertNonEmpty(record.policy.version, 'policy.version');
  assertNonEmpty(record.policy.digest, 'policy.digest');
  assertNonEmpty(record.evidenceBundleRef, 'evidenceBundleRef');

  const decisionAt = parseTimestamp(record.decisionAt, 'decisionAt');
  const recordedAt = parseTimestamp(record.recordedAt, 'recordedAt');
  if (recordedAt < decisionAt) throw new Error('recordedAt cannot precede decisionAt.');

  assertUniqueIds(record.opportunities, 'opportunity');
  assertUniqueIds(record.requirements, 'requirement');
  assertUniqueIds(record.attempts, 'attempt');
  assertUniqueIds(record.evidenceUsed, 'evidence');
  assertUniqueIds(record.unresolvedConflicts, 'conflict');

  const opportunities = new Map(record.opportunities.map((item) => [item.id, item]));
  const requirements = new Map(record.requirements.map((item) => [item.id, item]));
  const evidence = new Set(record.evidenceUsed.map((item) => item.id));

  for (const opportunity of record.opportunities) {
    assertNonEmpty(opportunity.capabilityKind, `opportunity.${opportunity.id}.capabilityKind`);
    assertNonEmpty(opportunity.attestationRef, `opportunity.${opportunity.id}.attestationRef`);
    const observedAt = parseTimestamp(opportunity.observedAt, `opportunity.${opportunity.id}.observedAt`);
    if (observedAt > decisionAt) {
      throw new Error(`Opportunity ${opportunity.id} was observed after the decision.`);
    }

    const validFrom = opportunity.validFrom === undefined
      ? undefined
      : parseTimestamp(opportunity.validFrom, `opportunity.${opportunity.id}.validFrom`);
    const validUntil = opportunity.validUntil === undefined
      ? undefined
      : parseTimestamp(opportunity.validUntil, `opportunity.${opportunity.id}.validUntil`);

    if (validFrom !== undefined && validUntil !== undefined && validFrom > validUntil) {
      throw new Error(`Opportunity ${opportunity.id} has an inverted validity window.`);
    }
    if (opportunity.status === 'available') {
      if (validFrom !== undefined && decisionAt < validFrom) {
        throw new Error(`Opportunity ${opportunity.id} was not yet valid at decision time.`);
      }
      if (validUntil !== undefined && decisionAt > validUntil) {
        throw new Error(`Opportunity ${opportunity.id} was expired at decision time.`);
      }
    }
  }

  for (const requirement of record.requirements) {
    assertNonEmpty(requirement.description, `requirement.${requirement.id}.description`);
    if (requirement.capabilityKinds.length === 0) {
      throw new Error(`Requirement ${requirement.id} needs at least one capability kind.`);
    }
    if (requirement.acceptedSourceClasses.length === 0) {
      throw new Error(`Requirement ${requirement.id} needs at least one accepted source class.`);
    }
    if (requirement.acceptedOpportunityAttestors.length === 0) {
      throw new Error(`Requirement ${requirement.id} needs at least one accepted opportunity attestor.`);
    }
    if (
      requirement.maxEvidenceAgeSeconds !== undefined &&
      (!Number.isInteger(requirement.maxEvidenceAgeSeconds) || requirement.maxEvidenceAgeSeconds <= 0)
    ) {
      throw new Error(`Requirement ${requirement.id} has invalid maxEvidenceAgeSeconds.`);
    }
  }

  for (const item of record.evidenceUsed) {
    assertNonEmpty(item.sourceRef, `evidence.${item.id}.sourceRef`);
    assertNonEmpty(item.digest, `evidence.${item.id}.digest`);
    const observedAt = parseTimestamp(item.observedAt, `evidence.${item.id}.observedAt`);
    if (observedAt > decisionAt) throw new Error(`Evidence ${item.id} was observed after the decision.`);
  }

  for (const attempt of record.attempts) {
    if (!requirements.has(attempt.requirementId)) {
      throw new Error(`Attempt ${attempt.id} references unknown requirement ${attempt.requirementId}.`);
    }
    const opportunity = opportunities.get(attempt.opportunityId);
    if (!opportunity) {
      throw new Error(`Attempt ${attempt.id} references unknown opportunity ${attempt.opportunityId}.`);
    }

    const startedAt = parseTimestamp(attempt.startedAt, `attempt.${attempt.id}.startedAt`);
    if (startedAt > decisionAt) throw new Error(`Attempt ${attempt.id} started after the decision.`);
    if (attempt.finishedAt !== undefined) {
      const finishedAt = parseTimestamp(attempt.finishedAt, `attempt.${attempt.id}.finishedAt`);
      if (finishedAt < startedAt || finishedAt > decisionAt) {
        throw new Error(`Attempt ${attempt.id} has an invalid finishedAt timestamp.`);
      }
    }

    for (const evidenceRef of attempt.evidenceRefs) {
      if (!evidence.has(evidenceRef)) {
        throw new Error(`Attempt ${attempt.id} references unknown evidence ${evidenceRef}.`);
      }
    }
    if (attempt.outcome === 'completed') {
      if (attempt.evidenceRefs.length === 0) {
        throw new Error(`Completed attempt ${attempt.id} must reference evidence.`);
      }
      if (opportunity.status !== 'available') {
        throw new Error(`Completed attempt ${attempt.id} cannot use a non-available opportunity.`);
      }
    }
  }

  for (const conflict of record.unresolvedConflicts) {
    const detectedAt = parseTimestamp(conflict.detectedAt, `conflict.${conflict.id}.detectedAt`);
    if (detectedAt > decisionAt) throw new Error(`Conflict ${conflict.id} was detected after the decision.`);
    if (conflict.evidenceRefs.length < 2) {
      throw new Error(`Conflict ${conflict.id} must reference at least two evidence items.`);
    }
    for (const evidenceRef of conflict.evidenceRefs) {
      if (!evidence.has(evidenceRef)) {
        throw new Error(`Conflict ${conflict.id} references unknown evidence ${evidenceRef}.`);
      }
    }
  }

  if (record.constraints.timeBudgetMs !== undefined && record.constraints.timeBudgetMs < 0) {
    throw new Error('constraints.timeBudgetMs cannot be negative.');
  }
  if (record.constraints.monetaryBudgetMinor !== undefined && record.constraints.monetaryBudgetMinor < 0) {
    throw new Error('constraints.monetaryBudgetMinor cannot be negative.');
  }
}

function opportunityMatchesRequirement(
  opportunity: VerificationOpportunity,
  requirement: EpistemicDiligenceRequirement,
): boolean {
  return (
    requirement.capabilityKinds.includes(opportunity.capabilityKind) &&
    requirement.acceptedSourceClasses.includes(opportunity.sourceClass) &&
    requirement.acceptedOpportunityAttestors.includes(opportunity.attestor)
  );
}

function completedAttemptHasAcceptableEvidence(
  record: DecisionInquiryRecord,
  requirement: EpistemicDiligenceRequirement,
  attempt: VerificationAttempt,
): boolean {
  if (attempt.outcome !== 'completed') return false;

  const evidenceById = new Map(record.evidenceUsed.map((item) => [item.id, item]));
  const decisionAt = Date.parse(record.decisionAt);

  return attempt.evidenceRefs.some((evidenceRef) => {
    const item = evidenceById.get(evidenceRef);
    if (!item || !requirement.acceptedSourceClasses.includes(item.sourceClass)) return false;
    if (requirement.maxEvidenceAgeSeconds === undefined) return true;
    const ageMs = decisionAt - Date.parse(item.observedAt);
    return ageMs >= 0 && ageMs <= requirement.maxEvidenceAgeSeconds * 1000;
  });
}

export function classifyRequirementCoverage(
  record: DecisionInquiryRecord,
  requirement: EpistemicDiligenceRequirement,
): RequirementCoverage {
  const matchedOpportunities = record.opportunities.filter((opportunity) =>
    opportunityMatchesRequirement(opportunity, requirement),
  );
  const matchedIds = new Set(matchedOpportunities.map((opportunity) => opportunity.id));
  const attempts = record.attempts.filter(
    (attempt) => attempt.requirementId === requirement.id && matchedIds.has(attempt.opportunityId),
  );
  const successfulAttempts = attempts.filter((attempt) =>
    completedAttemptHasAcceptableEvidence(record, requirement, attempt),
  );
  const unresolvedAttempts = attempts.filter(
    (attempt) =>
      ['failed', 'blocked', 'timed-out'].includes(attempt.outcome) ||
      (attempt.outcome === 'completed' && !completedAttemptHasAcceptableEvidence(record, requirement, attempt)),
  );

  if (successfulAttempts.length > 0) {
    return {
      requirementId: requirement.id,
      disposition: 'satisfied',
      matchedOpportunityIds: matchedOpportunities.map((item) => item.id),
      successfulAttemptIds: successfulAttempts.map((item) => item.id),
      unresolvedAttemptIds: unresolvedAttempts.map((item) => item.id),
    };
  }

  const available = matchedOpportunities.filter((item) => item.status === 'available');
  const explicitlySkipped = attempts.some((attempt) => attempt.outcome === 'skipped');
  if (available.length > 0 && (attempts.length === 0 || explicitlySkipped)) {
    return {
      requirementId: requirement.id,
      disposition: 'missed-available-check',
      matchedOpportunityIds: matchedOpportunities.map((item) => item.id),
      successfulAttemptIds: [],
      unresolvedAttemptIds: unresolvedAttempts.map((item) => item.id),
    };
  }

  if (unresolvedAttempts.length > 0) {
    return {
      requirementId: requirement.id,
      disposition: 'attempted-but-unresolved',
      matchedOpportunityIds: matchedOpportunities.map((item) => item.id),
      successfulAttemptIds: [],
      unresolvedAttemptIds: unresolvedAttempts.map((item) => item.id),
    };
  }

  if (matchedOpportunities.length > 0 && matchedOpportunities.every((item) => item.status === 'unavailable')) {
    return {
      requirementId: requirement.id,
      disposition: 'attested-unavailable',
      matchedOpportunityIds: matchedOpportunities.map((item) => item.id),
      successfulAttemptIds: [],
      unresolvedAttemptIds: [],
    };
  }

  return {
    requirementId: requirement.id,
    disposition: 'indeterminate',
    matchedOpportunityIds: matchedOpportunities.map((item) => item.id),
    successfulAttemptIds: [],
    unresolvedAttemptIds: unresolvedAttempts.map((item) => item.id),
  };
}

export function deriveDecisionInquiryCoverage(record: DecisionInquiryRecord): DecisionInquiryCoverage {
  assertValidDecisionInquiryRecord(record);
  const requirements = record.requirements.map((requirement) => classifyRequirementCoverage(record, requirement));
  const mandatoryIds = new Set(
    record.requirements.filter((requirement) => requirement.mandatory).map((requirement) => requirement.id),
  );
  const mandatorySatisfied = requirements.filter(
    (item) => mandatoryIds.has(item.requirementId) && item.disposition === 'satisfied',
  ).length;

  return {
    recordId: record.id,
    requirements,
    mandatorySatisfied,
    mandatoryTotal: mandatoryIds.size,
    hasMissedAvailableCheck: requirements.some((item) => item.disposition === 'missed-available-check'),
    hasUnresolvedEvidenceConflict: record.unresolvedConflicts.some(
      (conflict) => conflict.status === 'unresolved' || conflict.status === 'escalated',
    ),
  };
}

export function assertValidEpistemicDiligenceAssessment(
  assessment: EpistemicDiligenceAssessment,
  record: DecisionInquiryRecord,
): void {
  if (assessment.version !== 'noeone.epistemic-diligence-assessment.v1') {
    throw new Error('Unsupported epistemic diligence assessment version.');
  }
  if (assessment.decisionInquiryRecordId !== record.id) {
    throw new Error('Assessment targets a different decision inquiry record.');
  }
  assertNonEmpty(assessment.id, 'assessment.id');
  assertNonEmpty(assessment.evaluatorId, 'assessment.evaluatorId');
  assertNonEmpty(assessment.policyId, 'assessment.policyId');
  assertNonEmpty(assessment.policyVersion, 'assessment.policyVersion');
  assertNonEmpty(assessment.rationaleCode, 'assessment.rationaleCode');
  parseTimestamp(assessment.assessedAt, 'assessment.assessedAt');
}
