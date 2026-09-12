export type ChoiceKind =
  | 'CONTINUE'
  | 'FOLLOW'
  | 'PARTNER'
  | 'INVITE'
  | 'AUTHORIZE'
  | 'PAY'
  | 'SUPPORT';

export interface RevealedChoiceObservation {
  /**
   * Challenger capability minus incumbent capability in a pre-registered,
   * context-specific unit. Positive values mean the challenger is stronger.
   */
  capabilityDelta: number;
  choseIncumbent: boolean;
  context: string;
  choiceKind: ChoiceKind;
}

export interface BinomialEstimate {
  successes: number;
  trials: number;
  rate: number;
  lower95: number;
  upper95: number;
}

export interface ReplacementResistancePoint extends BinomialEstimate {
  capabilityDelta: number;
  /** Monotone non-increasing estimate after weighted isotonic regression. */
  monotoneRate: number;
}

export type ContinuityPremium50 =
  | { status: 'INSUFFICIENT_DATA' }
  | { status: 'ESTIMATED'; capabilityDelta: number }
  | { status: 'ABOVE_OBSERVED_RANGE'; lowerBound: number }
  | { status: 'BELOW_OBSERVED_RANGE'; upperBound: number };

const Z_95 = 1.959963984540054;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

export function wilsonInterval(successes: number, trials: number): BinomialEstimate {
  if (!Number.isInteger(successes) || successes < 0) {
    throw new RangeError('successes must be a non-negative integer.');
  }
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new RangeError('trials must be a positive integer.');
  }
  if (successes > trials) {
    throw new RangeError('successes cannot exceed trials.');
  }

  const rate = successes / trials;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / trials;
  const centre = rate + z2 / (2 * trials);
  const margin =
    Z_95 * Math.sqrt((rate * (1 - rate) + z2 / (4 * trials)) / trials);

  return {
    successes,
    trials,
    rate,
    lower95: Math.max(0, (centre - margin) / denominator),
    upper95: Math.min(1, (centre + margin) / denominator),
  };
}

interface IsotonicBlock {
  firstIndex: number;
  lastIndex: number;
  successes: number;
  trials: number;
}

function blockRate(block: IsotonicBlock): number {
  return block.successes / block.trials;
}

/**
 * Pool-adjacent-violators algorithm for a non-increasing binomial response.
 * Each delta is weighted by its observed sample count.
 */
function nonIncreasingIsotonic(
  groups: Array<{ successes: number; trials: number }>,
): number[] {
  const blocks: IsotonicBlock[] = [];

  groups.forEach((group, index) => {
    blocks.push({
      firstIndex: index,
      lastIndex: index,
      successes: group.successes,
      trials: group.trials,
    });

    while (blocks.length >= 2) {
      const right = blocks[blocks.length - 1]!;
      const left = blocks[blocks.length - 2]!;

      // For a non-increasing curve, a later block may not have a greater rate.
      if (blockRate(left) >= blockRate(right)) {
        break;
      }

      blocks.splice(blocks.length - 2, 2, {
        firstIndex: left.firstIndex,
        lastIndex: right.lastIndex,
        successes: left.successes + right.successes,
        trials: left.trials + right.trials,
      });
    }
  });

  const result = new Array<number>(groups.length);
  for (const block of blocks) {
    const rate = blockRate(block);
    for (let index = block.firstIndex; index <= block.lastIndex; index += 1) {
      result[index] = rate;
    }
  }

  return result;
}

export function buildReplacementResistanceCurve(
  observations: readonly RevealedChoiceObservation[],
): ReplacementResistancePoint[] {
  if (observations.length === 0) {
    return [];
  }

  const grouped = new Map<number, { successes: number; trials: number }>();

  for (const observation of observations) {
    assertFinite(observation.capabilityDelta, 'capabilityDelta');
    const current = grouped.get(observation.capabilityDelta) ?? {
      successes: 0,
      trials: 0,
    };
    current.trials += 1;
    if (observation.choseIncumbent) {
      current.successes += 1;
    }
    grouped.set(observation.capabilityDelta, current);
  }

  const deltas = [...grouped.keys()].sort((a, b) => a - b);
  const groups = deltas.map((delta) => grouped.get(delta)!);
  const monotoneRates = nonIncreasingIsotonic(groups);

  return deltas.map((capabilityDelta, index) => {
    const estimate = wilsonInterval(groups[index]!.successes, groups[index]!.trials);
    return {
      capabilityDelta,
      ...estimate,
      monotoneRate: monotoneRates[index]!,
    };
  });
}

/**
 * Estimates the capability advantage a challenger can hold before the incumbent
 * falls below a 50% revealed-choice share. It does not extrapolate outside the
 * measured range; bounds are returned instead.
 */
export function estimateContinuityPremium50(
  curve: readonly ReplacementResistancePoint[],
): ContinuityPremium50 {
  if (curve.length < 2) {
    return { status: 'INSUFFICIENT_DATA' };
  }

  const sorted = [...curve].sort((a, b) => a.capabilityDelta - b.capabilityDelta);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (first.monotoneRate < 0.5) {
    return { status: 'BELOW_OBSERVED_RANGE', upperBound: first.capabilityDelta };
  }

  if (last.monotoneRate >= 0.5) {
    return { status: 'ABOVE_OBSERVED_RANGE', lowerBound: last.capabilityDelta };
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1]!;
    const right = sorted[index]!;

    if (left.monotoneRate >= 0.5 && right.monotoneRate < 0.5) {
      const rateSpan = left.monotoneRate - right.monotoneRate;
      if (rateSpan === 0) {
        return {
          status: 'ESTIMATED',
          capabilityDelta: (left.capabilityDelta + right.capabilityDelta) / 2,
        };
      }

      const fraction = (left.monotoneRate - 0.5) / rateSpan;
      return {
        status: 'ESTIMATED',
        capabilityDelta:
          left.capabilityDelta +
          fraction * (right.capabilityDelta - left.capabilityDelta),
      };
    }
  }

  return { status: 'INSUFFICIENT_DATA' };
}

export function estimateProportion(successes: number, trials: number): BinomialEstimate {
  return wilsonInterval(successes, trials);
}

export function migrationRetention(before: number, after: number): number | null {
  assertFinite(before, 'before');
  assertFinite(after, 'after');
  if (before < 0 || after < 0) {
    throw new RangeError('before and after must be non-negative.');
  }
  if (before === 0) {
    return null;
  }
  return after / before;
}
