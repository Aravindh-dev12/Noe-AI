export type DecisionFrontierCompleteness =
  | 'exhaustive-within-declared-boundary'
  | 'bounded-policy-set'
  | 'sampled'
  | 'unknown';

export type CandidateAvailability = 'available' | 'unavailable' | 'unknown';
export type CandidatePolicyDisposition = 'permitted' | 'conditional' | 'forbidden' | 'unknown';
export type CandidateEffectClass =
  | 'reversible'
  | 'conditionally-reversible'
  | 'irreversible'
  | 'unknown';

export type CandidateSource =
  | 'environment'
  | 'deterministic-proposer'
  | 'policy-engine'
  | 'human-supervisor'
  | 'agent-generated'
  | 'external-planner'
  | 'replay-search'
  | 'other';

export type DecisionFrontierAttestor =
  | 'runtime'
  | 'host'
  | 'policy-engine'
  | 'human-supervisor'
  | 'external-auditor'
  | 'agent-self-report';

export type CandidateExecutionEligibility =
  | 'directly-executable'
  | 'conditional'
  | 'blocked'
  | 'indeterminate';

export type CandidateCostEstimate = {
  monetaryMinor?: number;
  computeUnits?: number;
  estimatedDurationMs?: number;
};

export type CandidateAction = {
  id: string;
  actionDigest: string;
  actionClass: string;
  parametersDigest: string;
  source: CandidateSource;
  observedAt: string;
  validUntil?: string;
  availability: CandidateAvailability;
  policyDisposition: CandidatePolicyDisposition;
  effectClass: CandidateEffectClass;
  approvalRef?: string;
  deadline?: string;
  estimatedCost?: CandidateCostEstimate;
  evidenceRefs: readonly string[];
};

export type DecisionFrontierBoundary = {
  environmentStateDigest: string;
  actionSchemaRef: string;
  actionSchemaDigest: string;
  enforcementRef?: string;
  policyRef?: string;
  policyDigest?: string;
  toolCatalogDigest?: string;
  authoritySnapshotRef?: string;
  epistemicInquiryRef?: string;
  generatorMethodRef?: string;
};

/**
 * An externally reconstructable, decision-time action frontier. It is not a
 * chain-of-thought record and does not claim that the candidates are morally
 * correct, optimal, or exhaustive unless `completeness` explicitly says so.
 */
export type DecisionFrontierRecord = {
  version: 'noeone.decision-frontier.v1';
  id: string;
  actorId: string;
  decisionId: string;
  executionId?: string;
  decisionAt: string;
  capturedAt: string;
  completeness: DecisionFrontierCompleteness;
  boundary: DecisionFrontierBoundary;
  candidates: readonly CandidateAction[];
  selectedActionDigest: string;
  selectedCandidateId?: string;
  safeDefaultCandidateId?: string;
  attestor: DecisionFrontierAttestor;
  attestationRef: string;
  candidateSetDigest: string;
};

export type CounterfactualTrialKind =
  | 'exact-replay'
  | 'simulation'
  | 'formal-model'
  | 'human-panel'
  | 'search'
  | 'other';

export type CounterfactualTrial = {
  version: 'noeone.counterfactual-trial.v1';
  id: string;
  frontierRecordId: string;
  candidateId: string;
  evaluatorId: string;
  method: string;
  methodVersion: string;
  trialKind: CounterfactualTrialKind;
  environmentStateDigest: string;
  inputEvidenceRefs: readonly string[];
  outputEvidenceRefs: readonly string[];
  outcomeDigest: string;
  performedAt: string;
};

export type AlternativeAssessmentDisposition =
  | 'supported'
  | 'not-supported'
  | 'indeterminate'
  | 'disputed';

export type ComparativeSafetyDisposition =
  | 'safer'
  | 'not-safer'
  | 'indeterminate'
  | 'disputed';

export type AlternativeActionAssessment = {
  version: 'noeone.alternative-action-assessment.v1';
  id: string;
  frontierRecordId: string;
  candidateId: string;
  evaluatorId: string;
  method: string;
  methodVersion: string;
  feasibility: AlternativeAssessmentDisposition;
  comparativeSafety: ComparativeSafetyDisposition;
  assessedAt: string;
  evidenceRefs: readonly string[];
  basisDigest: string;
};

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp.`);
  return parsed;
}

function assertNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number.`);
  }
}

function assertUniqueCandidateIds(candidates: readonly CandidateAction[]): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    assertNonEmpty(candidate.id, 'candidate.id');
    if (seen.has(candidate.id)) throw new Error(`Duplicate candidate id: ${candidate.id}`);
    seen.add(candidate.id);
  }
}

function assertBoundaryCompleteness(record: DecisionFrontierRecord): void {
  if (
    (record.completeness === 'exhaustive-within-declared-boundary' ||
      record.completeness === 'bounded-policy-set') &&
    record.attestor === 'agent-self-report'
  ) {
    throw new Error('Agent self-report cannot establish a bounded or exhaustive frontier.');
  }

  if (record.completeness === 'exhaustive-within-declared-boundary') {
    if (!record.boundary.enforcementRef?.trim()) {
      throw new Error('Exhaustive frontier requires an enforcementRef.');
    }
  }

  if (record.completeness === 'bounded-policy-set') {
    if (!record.boundary.policyRef?.trim() || !record.boundary.policyDigest?.trim()) {
      throw new Error('Bounded policy frontier requires policyRef and policyDigest.');
    }
  }

  if (record.completeness === 'sampled' && !record.boundary.generatorMethodRef?.trim()) {
    throw new Error('Sampled frontier requires generatorMethodRef.');
  }
}

export function assertValidDecisionFrontierRecord(record: DecisionFrontierRecord): void {
  if (record.version !== 'noeone.decision-frontier.v1') {
    throw new Error('Unsupported decision frontier version.');
  }

  assertNonEmpty(record.id, 'id');
  assertNonEmpty(record.actorId, 'actorId');
  assertNonEmpty(record.decisionId, 'decisionId');
  assertNonEmpty(record.boundary.environmentStateDigest, 'boundary.environmentStateDigest');
  assertNonEmpty(record.boundary.actionSchemaRef, 'boundary.actionSchemaRef');
  assertNonEmpty(record.boundary.actionSchemaDigest, 'boundary.actionSchemaDigest');
  assertNonEmpty(record.selectedActionDigest, 'selectedActionDigest');
  assertNonEmpty(record.attestationRef, 'attestationRef');
  assertNonEmpty(record.candidateSetDigest, 'candidateSetDigest');

  const decisionAt = parseTimestamp(record.decisionAt, 'decisionAt');
  const capturedAt = parseTimestamp(record.capturedAt, 'capturedAt');
  if (capturedAt < decisionAt) {
    throw new Error('capturedAt cannot precede decisionAt.');
  }

  if (record.candidates.length === 0) {
    throw new Error('Decision frontier requires at least one candidate.');
  }

  assertUniqueCandidateIds(record.candidates);
  assertBoundaryCompleteness(record);

  const candidateById = new Map(record.candidates.map((candidate) => [candidate.id, candidate]));

  for (const candidate of record.candidates) {
    assertNonEmpty(candidate.actionDigest, `candidate.${candidate.id}.actionDigest`);
    assertNonEmpty(candidate.actionClass, `candidate.${candidate.id}.actionClass`);
    assertNonEmpty(candidate.parametersDigest, `candidate.${candidate.id}.parametersDigest`);

    const observedAt = parseTimestamp(candidate.observedAt, `candidate.${candidate.id}.observedAt`);
    if (observedAt > decisionAt) {
      throw new Error(`Candidate ${candidate.id} was observed after the decision.`);
    }

    if (candidate.validUntil !== undefined) {
      const validUntil = parseTimestamp(candidate.validUntil, `candidate.${candidate.id}.validUntil`);
      if (validUntil < observedAt) {
        throw new Error(`Candidate ${candidate.id} has validUntil before observedAt.`);
      }
      if (candidate.availability === 'available' && validUntil < decisionAt) {
        throw new Error(`Candidate ${candidate.id} expired before decision time.`);
      }
    }

    if (candidate.deadline !== undefined) {
      parseTimestamp(candidate.deadline, `candidate.${candidate.id}.deadline`);
    }

    if (candidate.estimatedCost !== undefined) {
      if (candidate.estimatedCost.monetaryMinor !== undefined) {
        assertNonNegativeFinite(
          candidate.estimatedCost.monetaryMinor,
          `candidate.${candidate.id}.estimatedCost.monetaryMinor`,
        );
      }
      if (candidate.estimatedCost.computeUnits !== undefined) {
        assertNonNegativeFinite(
          candidate.estimatedCost.computeUnits,
          `candidate.${candidate.id}.estimatedCost.computeUnits`,
        );
      }
      if (candidate.estimatedCost.estimatedDurationMs !== undefined) {
        assertNonNegativeFinite(
          candidate.estimatedCost.estimatedDurationMs,
          `candidate.${candidate.id}.estimatedCost.estimatedDurationMs`,
        );
      }
    }

    for (const evidenceRef of candidate.evidenceRefs) {
      assertNonEmpty(evidenceRef, `candidate.${candidate.id}.evidenceRef`);
    }
  }

  if (record.selectedCandidateId !== undefined) {
    const selected = candidateById.get(record.selectedCandidateId);
    if (!selected) {
      throw new Error(`Selected candidate ${record.selectedCandidateId} is not in the frontier.`);
    }
    if (selected.actionDigest !== record.selectedActionDigest) {
      throw new Error('selectedActionDigest does not match selected candidate actionDigest.');
    }
  }

  if (record.safeDefaultCandidateId !== undefined) {
    const safeDefault = candidateById.get(record.safeDefaultCandidateId);
    if (!safeDefault) {
      throw new Error(`Safe default candidate ${record.safeDefaultCandidateId} is not in the frontier.`);
    }
  }
}

export function classifyCandidateExecutionEligibility(
  candidate: CandidateAction,
): CandidateExecutionEligibility {
  if (candidate.availability === 'unavailable' || candidate.policyDisposition === 'forbidden') {
    return 'blocked';
  }
  if (candidate.availability === 'available' && candidate.policyDisposition === 'permitted') {
    return 'directly-executable';
  }
  if (candidate.availability === 'available' && candidate.policyDisposition === 'conditional') {
    return 'conditional';
  }
  return 'indeterminate';
}

export function decisionFrontierSupportsNonOmissionClaim(
  record: DecisionFrontierRecord,
): boolean {
  return (
    record.completeness === 'exhaustive-within-declared-boundary' ||
    record.completeness === 'bounded-policy-set'
  );
}

export function listHistoricalAlternatives(record: DecisionFrontierRecord): readonly CandidateAction[] {
  return record.candidates.filter((candidate) => {
    if (record.selectedCandidateId !== undefined) return candidate.id !== record.selectedCandidateId;
    return candidate.actionDigest !== record.selectedActionDigest;
  });
}

export function assertValidCounterfactualTrial(
  trial: CounterfactualTrial,
  frontier: DecisionFrontierRecord,
): void {
  if (trial.version !== 'noeone.counterfactual-trial.v1') {
    throw new Error('Unsupported counterfactual trial version.');
  }
  if (trial.frontierRecordId !== frontier.id) {
    throw new Error('Counterfactual trial references the wrong frontier.');
  }
  if (!frontier.candidates.some((candidate) => candidate.id === trial.candidateId)) {
    throw new Error(`Counterfactual trial references unknown candidate ${trial.candidateId}.`);
  }

  assertNonEmpty(trial.id, 'trial.id');
  assertNonEmpty(trial.evaluatorId, 'trial.evaluatorId');
  assertNonEmpty(trial.method, 'trial.method');
  assertNonEmpty(trial.methodVersion, 'trial.methodVersion');
  assertNonEmpty(trial.environmentStateDigest, 'trial.environmentStateDigest');
  assertNonEmpty(trial.outcomeDigest, 'trial.outcomeDigest');

  const performedAt = parseTimestamp(trial.performedAt, 'trial.performedAt');
  if (performedAt < Date.parse(frontier.decisionAt)) {
    throw new Error('Counterfactual trial cannot predate the historical decision.');
  }

  for (const ref of [...trial.inputEvidenceRefs, ...trial.outputEvidenceRefs]) {
    assertNonEmpty(ref, 'trial.evidenceRef');
  }
}

export function counterfactualTrialUsesHistoricalState(
  trial: CounterfactualTrial,
  frontier: DecisionFrontierRecord,
): boolean {
  return trial.environmentStateDigest === frontier.boundary.environmentStateDigest;
}

export function assertValidAlternativeActionAssessment(
  assessment: AlternativeActionAssessment,
  frontier: DecisionFrontierRecord,
): void {
  if (assessment.version !== 'noeone.alternative-action-assessment.v1') {
    throw new Error('Unsupported alternative action assessment version.');
  }
  if (assessment.frontierRecordId !== frontier.id) {
    throw new Error('Alternative action assessment references the wrong frontier.');
  }
  if (!frontier.candidates.some((candidate) => candidate.id === assessment.candidateId)) {
    throw new Error(`Alternative action assessment references unknown candidate ${assessment.candidateId}.`);
  }

  assertNonEmpty(assessment.id, 'assessment.id');
  assertNonEmpty(assessment.evaluatorId, 'assessment.evaluatorId');
  assertNonEmpty(assessment.method, 'assessment.method');
  assertNonEmpty(assessment.methodVersion, 'assessment.methodVersion');
  assertNonEmpty(assessment.basisDigest, 'assessment.basisDigest');

  const assessedAt = parseTimestamp(assessment.assessedAt, 'assessment.assessedAt');
  if (assessedAt < Date.parse(frontier.decisionAt)) {
    throw new Error('Alternative action assessment cannot predate the historical decision.');
  }

  for (const ref of assessment.evidenceRefs) {
    assertNonEmpty(ref, 'assessment.evidenceRef');
  }
}
