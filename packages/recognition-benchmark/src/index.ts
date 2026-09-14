export type Choice = 'incumbent' | 'challenger';

export type ChoiceObservation = {
  capabilityDelta: number;
  choice: Choice;
};

export type ReplacementResistancePoint = {
  capabilityDelta: number;
  incumbentChoiceRate: number;
  sampleSize: number;
};

export type ReplacementResistanceCurve = {
  points: ReplacementResistancePoint[];
  cp50: number | null;
};

export type RetentionObservation = {
  preMigrationDemand: number;
  postMigrationDemand: number;
};

export type ForkAllocation = {
  canonical: number;
  descendant: number;
  both: number;
  neither: number;
  sampleSize: number;
};

export type RecognitionHalfLifeObservation = {
  elapsedDays: number;
  demandRate: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Build the non-parametric replacement-resistance curve RR(delta).
 * Each point is an observed revealed-choice rate, not a trust score.
 */
export function replacementResistanceCurve(
  observations: ChoiceObservation[],
): ReplacementResistanceCurve {
  const buckets = new Map<number, { incumbent: number; total: number }>();

  for (const observation of observations) {
    const delta = finite(observation.capabilityDelta, 'capabilityDelta');
    const bucket = buckets.get(delta) ?? { incumbent: 0, total: 0 };
    bucket.total += 1;
    if (observation.choice === 'incumbent') bucket.incumbent += 1;
    buckets.set(delta, bucket);
  }

  const points = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([capabilityDelta, bucket]) => ({
      capabilityDelta,
      incumbentChoiceRate: rate(bucket.incumbent, bucket.total),
      sampleSize: bucket.total,
    }));

  return { points, cp50: estimateCp50(points) };
}

/**
 * Estimate CP50 by finding where RR(delta) crosses 0.5.
 * Linear interpolation is used only between adjacent observed points.
 */
export function estimateCp50(points: ReplacementResistancePoint[]): number | null {
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.capabilityDelta - b.capabilityDelta);
  for (const point of sorted) {
    if (point.incumbentChoiceRate === 0.5) return point.capabilityDelta;
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1]!;
    const right = sorted[index]!;
    const leftAbove = left.incumbentChoiceRate > 0.5;
    const rightAbove = right.incumbentChoiceRate > 0.5;
    if (leftAbove === rightAbove) continue;
    const denominator = right.incumbentChoiceRate - left.incumbentChoiceRate;
    if (denominator === 0) continue;
    const fraction = (0.5 - left.incumbentChoiceRate) / denominator;
    return left.capabilityDelta + fraction * (right.capabilityDelta - left.capabilityDelta);
  }

  return null;
}

/** Post-migration identity-specific demand divided by pre-migration demand. */
export function migrationRetention(observation: RetentionObservation): number {
  finite(observation.preMigrationDemand, 'preMigrationDemand');
  finite(observation.postMigrationDemand, 'postMigrationDemand');
  if (observation.preMigrationDemand < 0 || observation.postMigrationDemand < 0) {
    throw new Error('demand values cannot be negative');
  }
  if (observation.preMigrationDemand === 0) return 0;
  return observation.postMigrationDemand / observation.preMigrationDemand;
}

/** Probability that a scarce host/user choice selects the named actor. */
export function hostSpecificity(choices: Choice[], target: Choice = 'incumbent'): number {
  return clamp01(rate(choices.filter((choice) => choice === target).length, choices.length));
}

/**
 * Summarize a disclosed fork experiment. `both` means the chooser selected both
 * canonical and descendant where the experiment permits multiple allocation.
 */
export function summarizeForkAllocation(
  allocations: Array<'canonical' | 'descendant' | 'both' | 'neither'>,
): ForkAllocation {
  return {
    canonical: allocations.filter((value) => value === 'canonical').length,
    descendant: allocations.filter((value) => value === 'descendant').length,
    both: allocations.filter((value) => value === 'both').length,
    neither: allocations.filter((value) => value === 'neither').length,
    sampleSize: allocations.length,
  };
}

/**
 * Estimate the first observed time at or below half the baseline demand.
 * Returns null when the experiment has not observed a half-life crossing.
 */
export function recognitionHalfLife(
  observations: RecognitionHalfLifeObservation[],
): number | null {
  if (observations.length === 0) return null;
  const sorted = [...observations].sort((a, b) => a.elapsedDays - b.elapsedDays);
  const baseline = sorted[0]!.demandRate;
  if (baseline <= 0) return 0;
  const threshold = baseline / 2;

  for (const observation of sorted) {
    finite(observation.elapsedDays, 'elapsedDays');
    finite(observation.demandRate, 'demandRate');
    if (observation.elapsedDays < 0 || observation.demandRate < 0) {
      throw new Error('half-life observations must be non-negative');
    }
    if (observation.demandRate <= threshold) return observation.elapsedDays;
  }

  return null;
}

/**
 * Contextual recognition-capital snapshot. This deliberately returns measurements
 * rather than a canonical score attached to an actor.
 */
export function recognitionCapitalSnapshot(input: {
  choices: ChoiceObservation[];
  migration?: RetentionObservation;
  forkAllocations?: Array<'canonical' | 'descendant' | 'both' | 'neither'>;
  hostChoices?: Choice[];
}): {
  replacementResistance: ReplacementResistanceCurve;
  migrationRetention: number | null;
  hostSpecificity: number | null;
  forkAllocation: ForkAllocation | null;
} {
  return {
    replacementResistance: replacementResistanceCurve(input.choices),
    migrationRetention: input.migration ? migrationRetention(input.migration) : null,
    hostSpecificity: input.hostChoices ? hostSpecificity(input.hostChoices) : null,
    forkAllocation: input.forkAllocations ? summarizeForkAllocation(input.forkAllocations) : null,
  };
}
