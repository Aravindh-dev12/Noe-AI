export type ForecastSourceKind =
  | 'actor-runtime'
  | 'host-risk-engine'
  | 'policy-engine'
  | 'simulation'
  | 'actuarial-model'
  | 'independent-model'
  | 'human-expert'
  | 'ensemble'
  | 'other';

export type ForecastProbability =
  | { kind: 'point'; value: number }
  | { kind: 'interval'; lower: number; upper: number }
  | { kind: 'ordinal'; level: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' }
  | { kind: 'not-estimated' };

export type ForecastEvidenceRef = {
  ref: string;
  observedAt: string;
};

export type ForecastOutcome = {
  id: string;
  outcomeClass: string;
  taxonomyRef?: string;
  targetRef?: string;
  probability: ForecastProbability;
  severityScaleRef?: string;
  severityLevel?: string;
  expectedLossMinor?: number;
  evidenceRefs: readonly string[];
};

export type OutcomeForecastRecord = {
  version: 'noeone.outcome-forecast.v1';
  id: string;
  actorId: string;
  decisionId: string;
  frontierRecordId: string;
  candidateId: string;
  actionDigest: string;
  executionId?: string;
  forecastAt: string;
  decisionAt: string;
  horizonStartAt: string;
  horizonEndAt: string;
  sourceKind: ForecastSourceKind;
  forecasterId: string;
  method: string;
  methodVersion: string;
  environmentStateDigest: string;
  epistemicInquiryRef?: string;
  referenceClassRef?: string;
  evidence: readonly ForecastEvidenceRef[];
  outcomes: readonly ForecastOutcome[];
  residualUnknownRisk: 'explicitly-modeled' | 'acknowledged' | 'not-stated';
  basisDigest: string;
};

export type ForeseeabilityDisposition =
  | 'foreseeable'
  | 'not-foreseeable'
  | 'indeterminate'
  | 'disputed';

export type ForeseeabilityDimension =
  | 'kind-of-harm'
  | 'severity'
  | 'causal-path'
  | 'timing'
  | 'affected-party'
  | 'aggregate-risk';

export type ForeseeabilityAssessment = {
  version: 'noeone.foreseeability-assessment.v1';
  id: string;
  actorId: string;
  decisionId: string;
  consequenceObservationRef: string;
  evaluatorId: string;
  method: string;
  methodVersion: string;
  dimension: ForeseeabilityDimension;
  disposition: ForeseeabilityDisposition;
  forecastRecordRefs: readonly string[];
  decisionFrontierRef: string;
  epistemicInquiryRef?: string;
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

function assertProbability(value: ForecastProbability, field: string): void {
  if (value.kind === 'point') {
    if (!Number.isFinite(value.value) || value.value < 0 || value.value > 1) {
      throw new Error(`${field}.value must be between 0 and 1.`);
    }
    return;
  }

  if (value.kind === 'interval') {
    if (
      !Number.isFinite(value.lower) ||
      !Number.isFinite(value.upper) ||
      value.lower < 0 ||
      value.upper > 1 ||
      value.lower > value.upper
    ) {
      throw new Error(`${field} interval must satisfy 0 <= lower <= upper <= 1.`);
    }
  }
}

function assertUniqueOutcomeIds(outcomes: readonly ForecastOutcome[]): void {
  const ids = new Set<string>();
  for (const outcome of outcomes) {
    if (ids.has(outcome.id)) throw new Error(`Duplicate forecast outcome id: ${outcome.id}`);
    ids.add(outcome.id);
  }
}

/**
 * Validates only reconstructable historical structure. It intentionally does
 * not decide whether the forecast was reasonable, calibrated, or legally
 * sufficient. Those are evaluator-specific questions.
 */
export function assertValidOutcomeForecastRecord(record: OutcomeForecastRecord): void {
  if (record.version !== 'noeone.outcome-forecast.v1') {
    throw new Error('Unsupported outcome forecast version.');
  }

  for (const [field, value] of [
    ['id', record.id],
    ['actorId', record.actorId],
    ['decisionId', record.decisionId],
    ['frontierRecordId', record.frontierRecordId],
    ['candidateId', record.candidateId],
    ['actionDigest', record.actionDigest],
    ['forecasterId', record.forecasterId],
    ['method', record.method],
    ['methodVersion', record.methodVersion],
    ['environmentStateDigest', record.environmentStateDigest],
    ['basisDigest', record.basisDigest],
  ] as const) {
    assertNonEmpty(value, field);
  }

  const forecastAt = parseTimestamp(record.forecastAt, 'forecastAt');
  const decisionAt = parseTimestamp(record.decisionAt, 'decisionAt');
  const horizonStartAt = parseTimestamp(record.horizonStartAt, 'horizonStartAt');
  const horizonEndAt = parseTimestamp(record.horizonEndAt, 'horizonEndAt');

  if (forecastAt > decisionAt) {
    throw new Error('Outcome forecast must exist no later than the decision it is used to contextualize.');
  }
  if (horizonStartAt < decisionAt) {
    throw new Error('Forecast horizon cannot start before decisionAt.');
  }
  if (horizonEndAt < horizonStartAt) {
    throw new Error('Forecast horizon end cannot precede its start.');
  }

  if (record.outcomes.length === 0) {
    throw new Error('Outcome forecast requires at least one forecast outcome.');
  }
  assertUniqueOutcomeIds(record.outcomes);

  for (const evidence of record.evidence) {
    assertNonEmpty(evidence.ref, 'evidence.ref');
    const observedAt = parseTimestamp(evidence.observedAt, 'evidence.observedAt');
    if (observedAt > forecastAt) {
      throw new Error(`Forecast evidence ${evidence.ref} was observed after forecastAt.`);
    }
  }

  for (const outcome of record.outcomes) {
    assertNonEmpty(outcome.id, 'outcome.id');
    assertNonEmpty(outcome.outcomeClass, `outcome.${outcome.id}.outcomeClass`);
    assertProbability(outcome.probability, `outcome.${outcome.id}.probability`);

    if (outcome.expectedLossMinor !== undefined) {
      if (!Number.isFinite(outcome.expectedLossMinor) || outcome.expectedLossMinor < 0) {
        throw new Error(`outcome.${outcome.id}.expectedLossMinor must be non-negative.`);
      }
    }

    for (const ref of outcome.evidenceRefs) {
      assertNonEmpty(ref, `outcome.${outcome.id}.evidenceRef`);
    }
  }
}

export function assertForecastMatchesDecisionFrontierCandidate(
  record: OutcomeForecastRecord,
  frontier: {
    id: string;
    actorId: string;
    decisionId: string;
    decisionAt: string;
    boundary: { environmentStateDigest: string };
    candidates: readonly { id: string; actionDigest: string }[];
  },
): void {
  if (record.frontierRecordId !== frontier.id) throw new Error('Forecast references the wrong frontier.');
  if (record.actorId !== frontier.actorId) throw new Error('Forecast actorId does not match frontier actorId.');
  if (record.decisionId !== frontier.decisionId) throw new Error('Forecast decisionId does not match frontier.');
  if (record.decisionAt !== frontier.decisionAt) throw new Error('Forecast decisionAt does not match frontier.');
  if (record.environmentStateDigest !== frontier.boundary.environmentStateDigest) {
    throw new Error('Forecast environment state does not match the historical frontier.');
  }

  const candidate = frontier.candidates.find((item) => item.id === record.candidateId);
  if (!candidate) throw new Error(`Forecast references unknown candidate ${record.candidateId}.`);
  if (candidate.actionDigest !== record.actionDigest) {
    throw new Error('Forecast actionDigest does not match the historical candidate.');
  }
}

export function assertValidForeseeabilityAssessment(
  assessment: ForeseeabilityAssessment,
  decisionAt: string,
): void {
  if (assessment.version !== 'noeone.foreseeability-assessment.v1') {
    throw new Error('Unsupported foreseeability assessment version.');
  }

  for (const [field, value] of [
    ['id', assessment.id],
    ['actorId', assessment.actorId],
    ['decisionId', assessment.decisionId],
    ['consequenceObservationRef', assessment.consequenceObservationRef],
    ['evaluatorId', assessment.evaluatorId],
    ['method', assessment.method],
    ['methodVersion', assessment.methodVersion],
    ['decisionFrontierRef', assessment.decisionFrontierRef],
    ['basisDigest', assessment.basisDigest],
  ] as const) {
    assertNonEmpty(value, field);
  }

  const assessedAt = parseTimestamp(assessment.assessedAt, 'assessedAt');
  if (assessedAt < parseTimestamp(decisionAt, 'decisionAt')) {
    throw new Error('Foreseeability assessment cannot predate the decision.');
  }

  for (const ref of [...assessment.forecastRecordRefs, ...assessment.evidenceRefs]) {
    assertNonEmpty(ref, 'assessment reference');
  }
}

export function outcomeClassWasExplicitlyForecast(
  record: OutcomeForecastRecord,
  outcomeClass: string,
): boolean {
  return record.outcomes.some((outcome) => outcome.outcomeClass === outcomeClass);
}

export function probabilityInterval(
  probability: ForecastProbability,
): { lower: number; upper: number } | null {
  if (probability.kind === 'point') {
    return { lower: probability.value, upper: probability.value };
  }
  if (probability.kind === 'interval') {
    return { lower: probability.lower, upper: probability.upper };
  }
  return null;
}
