import { describe, expect, it } from 'vitest';

import {
  buildReplacementResistanceCurve,
  estimateContinuityPremium50,
  migrationRetention,
  wilsonInterval,
  type RevealedChoiceObservation,
} from './index.js';

function observations(
  capabilityDelta: number,
  incumbentWins: number,
  trials: number,
): RevealedChoiceObservation[] {
  return Array.from({ length: trials }, (_, index) => ({
    capabilityDelta,
    choseIncumbent: index < incumbentWins,
    context: 'research.partner-choice',
    choiceKind: 'PARTNER' as const,
  }));
}

describe('wilsonInterval', () => {
  it('returns a bounded 95% interval', () => {
    const estimate = wilsonInterval(50, 100);
    expect(estimate.rate).toBe(0.5);
    expect(estimate.lower95).toBeGreaterThan(0.39);
    expect(estimate.upper95).toBeLessThan(0.61);
  });
});

describe('buildReplacementResistanceCurve', () => {
  it('groups observations and preserves an already monotone curve', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 9, 10),
      ...observations(0.1, 7, 10),
      ...observations(0.2, 4, 10),
    ]);

    expect(curve.map((point) => point.monotoneRate)).toEqual([0.9, 0.7, 0.4]);
  });

  it('uses isotonic pooling when sampling noise violates monotonicity', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 8, 10),
      ...observations(0.1, 5, 10),
      ...observations(0.2, 7, 10),
      ...observations(0.3, 2, 10),
    ]);

    expect(curve[0]!.monotoneRate).toBe(0.8);
    expect(curve[1]!.monotoneRate).toBe(0.6);
    expect(curve[2]!.monotoneRate).toBe(0.6);
    expect(curve[3]!.monotoneRate).toBe(0.2);
  });
});

describe('estimateContinuityPremium50', () => {
  it('interpolates the 50% crossing without extrapolating', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 9, 10),
      ...observations(0.1, 7, 10),
      ...observations(0.2, 4, 10),
    ]);

    const estimate = estimateContinuityPremium50(curve);
    expect(estimate.status).toBe('ESTIMATED');
    if (estimate.status === 'ESTIMATED') {
      expect(estimate.capabilityDelta).toBeCloseTo(0.166666, 4);
    }
  });

  it('returns a lower bound when incumbent demand remains above 50%', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 9, 10),
      ...observations(0.2, 7, 10),
    ]);

    expect(estimateContinuityPremium50(curve)).toEqual({
      status: 'ABOVE_OBSERVED_RANGE',
      lowerBound: 0.2,
    });
  });

  it('returns an upper bound when the incumbent is already below 50%', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 4, 10),
      ...observations(0.2, 2, 10),
    ]);

    expect(estimateContinuityPremium50(curve)).toEqual({
      status: 'BELOW_OBSERVED_RANGE',
      upperBound: 0,
    });
  });
});

describe('migrationRetention', () => {
  it('returns post/pre demand and avoids division by zero', () => {
    expect(migrationRetention(100, 82)).toBe(0.82);
    expect(migrationRetention(0, 0)).toBeNull();
  });
});
