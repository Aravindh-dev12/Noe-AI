import { describe, expect, it } from 'vitest';
import {
  estimateCp50,
  hostSpecificity,
  migrationRetention,
  recognitionCapitalSnapshot,
  recognitionHalfLife,
  replacementResistanceCurve,
  summarizeForkAllocation,
} from './index.js';

describe('recognition benchmark', () => {
  it('builds a replacement-resistance curve and estimates CP50', () => {
    const result = replacementResistanceCurve([
      { capabilityDelta: 0, choice: 'incumbent' },
      { capabilityDelta: 0, choice: 'incumbent' },
      { capabilityDelta: 0.2, choice: 'incumbent' },
      { capabilityDelta: 0.2, choice: 'challenger' },
      { capabilityDelta: 0.4, choice: 'challenger' },
      { capabilityDelta: 0.4, choice: 'challenger' },
    ]);

    expect(result.points).toHaveLength(3);
    expect(result.points[0]?.incumbentChoiceRate).toBe(1);
    expect(result.points[1]?.incumbentChoiceRate).toBe(0.5);
    expect(result.cp50).toBe(0.2);
  });

  it('does not invent a CP50 outside observed support', () => {
    expect(
      estimateCp50([
        { capabilityDelta: 0, incumbentChoiceRate: 1, sampleSize: 10 },
        { capabilityDelta: 1, incumbentChoiceRate: 0.8, sampleSize: 10 },
      ]),
    ).toBeNull();
  });

  it('computes migration retention without treating zero baseline as infinite retention', () => {
    expect(migrationRetention({ preMigrationDemand: 100, postMigrationDemand: 82 })).toBe(0.82);
    expect(migrationRetention({ preMigrationDemand: 0, postMigrationDemand: 50 })).toBe(0);
    expect(() => migrationRetention({ preMigrationDemand: -1, postMigrationDemand: 0 })).toThrow();
  });

  it('summarizes fork allocation without assigning inherited reputation', () => {
    expect(summarizeForkAllocation(['canonical', 'descendant', 'both', 'neither', 'canonical'])).toEqual({
      canonical: 2,
      descendant: 1,
      both: 1,
      neither: 1,
      sampleSize: 5,
    });
  });

  it('measures contextual host specificity as observed choice', () => {
    expect(hostSpecificity(['incumbent', 'incumbent', 'challenger'])).toBeCloseTo(2 / 3);
  });

  it('finds an observed recognition half-life crossing', () => {
    expect(
      recognitionHalfLife([
        { elapsedDays: 0, demandRate: 1 },
        { elapsedDays: 7, demandRate: 0.8 },
        { elapsedDays: 14, demandRate: 0.49 },
      ]),
    ).toBe(14);
    expect(recognitionHalfLife([{ elapsedDays: 0, demandRate: 1 }, { elapsedDays: 30, demandRate: 0.7 }])).toBeNull();
  });

  it('keeps derived metrics contextual instead of storing a universal score', () => {
    const snapshot = recognitionCapitalSnapshot({
      choices: [
        { capabilityDelta: 0, choice: 'incumbent' },
        { capabilityDelta: 0.3, choice: 'challenger' },
      ],
      migration: { preMigrationDemand: 10, postMigrationDemand: 8 },
      hostChoices: ['incumbent', 'challenger', 'incumbent'],
      forkAllocations: ['canonical', 'descendant'],
    });

    expect(snapshot.migrationRetention).toBe(0.8);
    expect(snapshot.hostSpecificity).toBeCloseTo(2 / 3);
    expect(snapshot.forkAllocation?.sampleSize).toBe(2);
    expect('score' in snapshot).toBe(false);
  });
});
