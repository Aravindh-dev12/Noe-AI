export type ContinuityEvent = {
  actorId: string;
  executionId: string;
  model: string;
  environment: string;
  step: number;
  action: string;
  outcome?: string;
};

export type ContinuityRun = {
  actorId: string;
  predecessorExecutionId: string;
  successorExecutionId: string;
  events: ContinuityEvent[];
};

export type BehavioralContinuity = {
  actionAgreement: number;
  outcomeAgreement: number;
  eventCount: number;
};

export type IdentityRecognition = {
  continuingChoiceRate: number;
  freshCloneChoiceRate: number;
  sampleSize: number;
};

export type ContinuityScore = {
  mechanical: number;
  behavioral: number;
  social: number;
  institutional: number;
};

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/** Compare matched actions before and after an authorized model migration. */
export function measureBehavioralContinuity(
  predecessor: ContinuityEvent[],
  successor: ContinuityEvent[],
): BehavioralContinuity {
  const n = Math.min(predecessor.length, successor.length);
  if (n === 0) return { actionAgreement: 0, outcomeAgreement: 0, eventCount: 0 };

  let actions = 0;
  let outcomes = 0;

  for (let i = 0; i < n; i += 1) {
    if (predecessor[i]?.action === successor[i]?.action) actions += 1;
    if (predecessor[i]?.outcome !== undefined && predecessor[i]?.outcome === successor[i]?.outcome) {
      outcomes += 1;
    }
  }

  const comparableOutcomes = successor.slice(0, n).filter((event, i) =>
    predecessor[i]?.outcome !== undefined && event.outcome !== undefined,
  ).length;

  return {
    actionAgreement: ratio(actions, n),
    outcomeAgreement: ratio(outcomes, comparableOutcomes),
    eventCount: n,
  };
}

/**
 * Compute the human-recognition component from a blinded choice experiment.
 * Each participant chooses between the authorized continuation and a fresh clone.
 */
export function measureIdentityRecognition(
  choices: Array<'continuation' | 'clone'>,
): IdentityRecognition {
  const continuing = choices.filter((choice) => choice === 'continuation').length;
  const sampleSize = choices.length;

  return {
    continuingChoiceRate: ratio(continuing, sampleSize),
    freshCloneChoiceRate: ratio(sampleSize - continuing, sampleSize),
    sampleSize,
  };
}

/**
 * Mechanical continuity is deliberately supplied by the registry rather than inferred
 * from model behavior. The benchmark keeps the four dimensions separate so a system
 * cannot hide weak social or behavioral continuity behind a perfect cryptographic chain.
 */
export function scoreContinuity(input: {
  mechanicalValid: boolean;
  behavioral: BehavioralContinuity;
  social: IdentityRecognition;
  institutionalAcceptanceRate: number;
}): ContinuityScore {
  return {
    mechanical: input.mechanicalValid ? 1 : 0,
    behavioral: (input.behavioral.actionAgreement + input.behavioral.outcomeAgreement) / 2,
    social: input.social.continuingChoiceRate,
    institutional: Math.max(0, Math.min(1, input.institutionalAcceptanceRate)),
  };
}

export function continuityVector(score: ContinuityScore): [number, number, number, number] {
  return [score.mechanical, score.behavioral, score.social, score.institutional];
}
