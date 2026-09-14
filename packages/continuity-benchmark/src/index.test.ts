import assert from 'node:assert/strict';
import test from 'node:test';
import {
  measureBehavioralContinuity,
  measureIdentityRecognition,
  scoreContinuity,
} from './index.js';

test('measures matched behavioral continuity across a model swap', () => {
  const before = [
    { actorId: 'a', executionId: 'e1', model: 'm1', environment: 'triad@1', step: 1, action: 'A', outcome: 'win' },
    { actorId: 'a', executionId: 'e1', model: 'm1', environment: 'triad@1', step: 2, action: 'B', outcome: 'loss' },
  ];
  const after = [
    { actorId: 'a', executionId: 'e2', model: 'm2', environment: 'triad@1', step: 1, action: 'A', outcome: 'win' },
    { actorId: 'a', executionId: 'e2', model: 'm2', environment: 'triad@1', step: 2, action: 'C', outcome: 'loss' },
  ];

  const result = measureBehavioralContinuity(before, after);
  assert.equal(result.actionAgreement, 0.5);
  assert.equal(result.outcomeAgreement, 1);
  assert.equal(result.eventCount, 2);
});

test('measures recognition separately from behavioral similarity', () => {
  const result = measureIdentityRecognition([
    'continuation',
    'continuation',
    'clone',
    'continuation',
  ]);

  assert.equal(result.sampleSize, 4);
  assert.equal(result.continuingChoiceRate, 0.75);
  assert.equal(result.freshCloneChoiceRate, 0.25);
});

test('keeps mechanical, behavioral, social, and institutional continuity separate', () => {
  const score = scoreContinuity({
    mechanicalValid: true,
    behavioral: { actionAgreement: 0.8, outcomeAgreement: 0.6, eventCount: 10 },
    social: { continuingChoiceRate: 0.7, freshCloneChoiceRate: 0.3, sampleSize: 10 },
    institutionalAcceptanceRate: 1.2,
  });

  assert.deepEqual(score, {
    mechanical: 1,
    behavioral: 0.7,
    social: 0.7,
    institutional: 1,
  });
});
