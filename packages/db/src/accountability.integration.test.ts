import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAuthorityGrant,
  db,
  recordAuthorityExercise,
  recordConsequenceAttribution,
  recordConsequenceObservation,
  registerEvidenceReference,
  revokeAuthorityGrant,
  verifyAuthorityExercise,
  verifyConsequenceState,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_accountability_${suffix}`;
const actorId = `act_accountability_${suffix}`;
const executionId = `exec_accountability_${suffix}`;
const lineageId = `lin_accountability_${suffix}`;
const signingSecret = 'test-accountability-signing-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-accountability@test',
  issuer: 'noeone-test',
} as const;

const evidenceArtifactIds: string[] = [];
const grantIds: string[] = [];

beforeAll(async () => {
  const startedAt = new Date('2026-09-12T09:00:00.000Z');
  await db.host.create({
    data: {
      id: hostId,
      slug: `accountability-${suffix}`,
      displayName: 'Accountability Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `acct-${suffix}`.slice(0, 32),
      displayName: `Accountability Actor ${suffix}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: startedAt,
    },
  });
  await db.actorExecution.create({
    data: {
      id: executionId,
      actorId,
      provider: 'mock',
      model: 'accountability-model-a',
      runtime: 'accountability-runtime-a',
      configHash: `sha256:${'c'.repeat(64)}`,
      startedAt,
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: startedAt,
    },
  });
});

afterAll(async () => {
  await db.consequenceAttribution.deleteMany({ where: { actorId } });
  await db.consequenceObservation.deleteMany({
    where: {
      OR: [
        { sourceAuthorityExercise: { actorId } },
        { sourceEvidence: { bindings: { some: { actorId } } } },
      ],
    },
  });
  await db.authorityExercise.deleteMany({ where: { actorId } });
  for (const grantId of grantIds.slice().reverse()) {
    await db.authorityGrant.deleteMany({ where: { id: grantId } });
  }
  await db.actorEvidenceBinding.deleteMany({ where: { actorId } });
  if (evidenceArtifactIds.length > 0) {
    await db.evidenceValidation.deleteMany({
      where: { evidenceArtifactId: { in: evidenceArtifactIds } },
    });
    await db.evidenceArtifact.deleteMany({ where: { id: { in: evidenceArtifactIds } } });
  }
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('temporal accountability and consequence graph', () => {
  it('preserves historical coverage and permits conflicting attribution without rewriting outcomes', async () => {
    const grantedAt = new Date('2026-09-12T10:00:00.000Z');
    const firstActionAt = new Date('2026-09-12T10:30:00.000Z');
    const revokedAt = new Date('2026-09-12T11:00:00.000Z');
    const secondActionAt = new Date('2026-09-12T11:30:00.000Z');
    const outcomeAt = new Date('2026-09-12T12:00:00.000Z');

    const actionEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'action-subject',
        kind: 'service-action-record',
        issuer: `merchant-test-${suffix}`,
        externalId: `action-1-${suffix}`,
        digest: `sha256:${'1'.repeat(64)}`,
        observedAt: firstActionAt,
      },
      registry,
    );
    evidenceArtifactIds.push(actionEvidence.artifact.id);

    const root = await createAuthorityGrant(
      {
        subjectActorId: actorId,
        grantor: { type: 'external', ref: `principal:${suffix}` },
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: false,
        remainingDelegationDepth: 0,
        maxAmountMinor: '2000',
        currency: 'USD',
        notBefore: grantedAt,
        expiresAt: new Date('2026-09-12T13:00:00.000Z'),
        principal: { type: 'admin' },
        idempotencyKey: `acct-grant-${suffix}`,
        now: grantedAt,
      },
      registry,
    );
    grantIds.push(root.grant.id);

    const firstExercise = await recordAuthorityExercise(
      {
        actorId,
        executionId,
        grantId: root.grant.id,
        evidenceArtifactId: actionEvidence.artifact.id,
        action: 'purchase',
        resource: 'checkout',
        amountMinor: '1500',
        currency: 'USD',
        exercisedAt: firstActionAt,
        idempotencyKey: `acct-exercise-covered-${suffix}`,
      },
      registry,
    );
    expect(firstExercise.exercise.coverageStatus).toBe('COVERED');
    expect(firstExercise.replayed).toBe(false);

    const replayedExercise = await recordAuthorityExercise(
      {
        actorId,
        executionId,
        grantId: root.grant.id,
        evidenceArtifactId: actionEvidence.artifact.id,
        action: 'purchase',
        resource: 'checkout',
        amountMinor: '1500',
        currency: 'USD',
        exercisedAt: firstActionAt,
        idempotencyKey: `acct-exercise-covered-${suffix}`,
      },
      registry,
    );
    expect(replayedExercise.replayed).toBe(true);
    expect(replayedExercise.exercise.id).toBe(firstExercise.exercise.id);

    await revokeAuthorityGrant(
      {
        grantId: root.grant.id,
        reason: 'principal withdrew future authority',
        principal: { type: 'admin' },
        idempotencyKey: `acct-revoke-${suffix}`,
        now: revokedAt,
      },
      registry,
    );

    const historicalVerification = await verifyAuthorityExercise(firstExercise.exercise.id);
    expect(historicalVerification.valid).toBe(true);
    expect(historicalVerification.issues).toEqual([]);

    const laterActionEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'action-subject',
        kind: 'service-action-record',
        issuer: `merchant-test-${suffix}`,
        externalId: `action-2-${suffix}`,
        digest: `sha256:${'2'.repeat(64)}`,
        observedAt: secondActionAt,
      },
      registry,
    );
    evidenceArtifactIds.push(laterActionEvidence.artifact.id);

    const laterExercise = await recordAuthorityExercise(
      {
        actorId,
        executionId,
        grantId: root.grant.id,
        evidenceArtifactId: laterActionEvidence.artifact.id,
        action: 'purchase',
        resource: 'checkout',
        amountMinor: '1500',
        currency: 'USD',
        exercisedAt: secondActionAt,
        idempotencyKey: `acct-exercise-uncovered-${suffix}`,
      },
      registry,
    );
    expect(laterExercise.exercise.coverageStatus).toBe('NOT_COVERED');
    expect((await verifyAuthorityExercise(laterExercise.exercise.id)).valid).toBe(true);

    const outcomeEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'outcome-subject',
        kind: 'settlement-record',
        issuer: `settlement-test-${suffix}`,
        externalId: `outcome-1-${suffix}`,
        digest: `sha256:${'3'.repeat(64)}`,
        observedAt: outcomeAt,
      },
      registry,
    );
    evidenceArtifactIds.push(outcomeEvidence.artifact.id);

    const observation = await recordConsequenceObservation({
      kind: 'payment-settled',
      sourceEvidenceArtifactId: outcomeEvidence.artifact.id,
      sourceAuthorityExerciseId: firstExercise.exercise.id,
      occurredAt: outcomeAt,
      valueMinor: '1500',
      currency: 'USD',
      externalFramework: 'test-settlement',
      externalReference: `settlement:${suffix}`,
      idempotencyKey: `acct-consequence-${suffix}`,
      metadata: { note: 'observation does not assert causation' },
    });

    const causal = await recordConsequenceAttribution(
      {
        consequenceId: observation.observation.id,
        actorId,
        assessmentType: 'causal',
        disposition: 'SUPPORTED',
        method: 'actual-causality',
        methodVersion: 'v1',
        evaluator: `causal-evaluator:${suffix}`,
        scoreBps: 7200,
        sourceEvidenceArtifactId: outcomeEvidence.artifact.id,
        idempotencyKey: `acct-attribution-causal-${suffix}`,
      },
      registry,
    );

    const disputed = await recordConsequenceAttribution(
      {
        consequenceId: observation.observation.id,
        actorId,
        assessmentType: 'responsibility',
        disposition: 'DISPUTED',
        method: 'human-panel',
        methodVersion: 'v1',
        evaluator: `panel-evaluator:${suffix}`,
        sourceEvidenceArtifactId: outcomeEvidence.artifact.id,
        idempotencyKey: `acct-attribution-panel-${suffix}`,
      },
      registry,
    );

    expect(causal.attribution.disposition).toBe('SUPPORTED');
    expect(causal.attribution.scoreBps).toBe(7200);
    expect(disputed.attribution.disposition).toBe('DISPUTED');
    expect(disputed.attribution.scoreBps).toBeNull();

    const storedObservation = await db.consequenceObservation.findUniqueOrThrow({
      where: { id: observation.observation.id },
      include: { attributions: { orderBy: { createdAt: 'asc' } } },
    });
    expect(storedObservation.kind).toBe('payment-settled');
    expect(storedObservation.attributions).toHaveLength(2);

    const consequenceVerification = await verifyConsequenceState(actorId);
    expect(consequenceVerification.valid).toBe(true);
    expect(consequenceVerification.attributionCount).toBe(2);
  });
});
