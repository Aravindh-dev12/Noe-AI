import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

void describe('wilsonInterval', () => {
  void it('returns a bounded 95% interval', () => {
    const estimate = wilsonInterval(50, 100);
    assert.equal(estimate.rate, 0.5);
    assert.ok(estimate.lower95 > 0.39);
    assert.ok(estimate.upper95 < 0.61);
  });
});

void describe('buildReplacementResistanceCurve', () => {
  void it('groups observations and preserves an already monotone curve', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 9, 10),
      ...observations(0.1, 7, 10),
      ...observations(0.2, 4, 10),
    ]);

    assert.deepEqual(
      curve.map((point) => point.monotoneRate),
      [0.9, 0.7, 0.4],
    );
  });

  void it('uses isotonic pooling when sampling noise violates monotonicity', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 8, 10),
      ...observations(0.1, 5, 10),
      ...observations(0.2, 7, 10),
      ...observations(0.3, 2, 10),
    ]);

    assert.equal(curve[0]!.monotoneRate, 0.8);
    assert.equal(curve[1]!.monotoneRate, 0.6);
    assert.equal(curve[2]!.monotoneRate, 0.6);
    assert.equal(curve[3]!.monotoneRate, 0.2);
  });
});

void describe('estimateContinuityPremium50', () => {
  void it('interpolates the 50% crossing without extrapolating', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 9, 10),
      ...observations(0.1, 7, 10),
      ...observations(0.2, 4, 10),
    ]);

    const estimate = estimateContinuityPremium50(curve);
    assert.equal(estimate.status, 'ESTIMATED');
    if (estimate.status === 'ESTIMATED') {
      assert.ok(Math.abs(estimate.capabilityDelta - 0.1666666667) < 0.0001);
    }
  });

  void it('returns a lower bound when incumbent demand remains above 50%', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 9, 10),
      ...observations(0.2, 7, 10),
    ]);

    assert.deepEqual(estimateContinuityPremium50(curve), {
      status: 'ABOVE_OBSERVED_RANGE',
      lowerBound: 0.2,
    });
  });

  void it('returns an upper bound when the incumbent is already below 50%', () => {
    const curve = buildReplacementResistanceCurve([
      ...observations(0, 4, 10),
      ...observations(0.2, 2, 10),
    ]);

    assert.deepEqual(estimateContinuityPremium50(curve), {
      status: 'BELOW_OBSERVED_RANGE',
      upperBound: 0,
    });
  });
});

void describe('migrationRetention', () => {
  void it('returns post/pre demand and avoids division by zero', () => {
    assert.equal(migrationRetention(100, 82), 0.82);
    assert.equal(migrationRetention(0, 0), null);
  });
});
