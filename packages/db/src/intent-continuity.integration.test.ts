import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  InstitutionalConflictError,
  createAuthorityGrant,
  db,
  recordAuthorityExercise,
  registerIntentAssessment,
  registerIntentMandate,
  registerIntentTransform,
  verifyAuthorityIntentChain,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_intent_${suffix}`;
const signingSecret = 'test-intent-continuity-signing-secret-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-intent-continuity@test',
  issuer: 'noeone-test',
} as const;
const actorIds: string[] = [];
const grantIds: string[] = [];
const artifactIds: string[] = [];
const exerciseIds: string[] = [];

async function createActor(label: string) {
  const actorId = `act_intent_${label}_${randomUUID()}`;
  const executionId = `exec_intent_${label}_${randomUUID()}`;
  const lineageId = `lin_intent_${label}_${randomUUID()}`;
  actorIds.push(actorId);

  await db.actor.create({
    data: {
      id: actorId,
      handle: `intent-${label}-${randomUUID()}`.slice(0, 32),
      displayName: `Intent ${label} ${suffix}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: new Date(),
    },
  });
  await db.actorExecution.create({
    data: {
      id: executionId,
      actorId,
      provider: 'mock',
      model: 'model-a',
      runtime: 'runtime-a',
      configHash: `sha256:${'a'.repeat(64)}`,
      startedAt: new Date(),
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: new Date(),
    },
  });

  return { actorId, executionId };
}

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `intent-${suffix}`,
      displayName: 'Intent Continuity Test Registry',
      status: 'active',
    },
  });
});

afterAll(async () => {
  if (exerciseIds.length > 0) {
    await db.authorityExercise.deleteMany({ where: { id: { in: exerciseIds } } });
  }
  for (const grantId of grantIds.slice().reverse()) {
    await db.authorityGrant.deleteMany({ where: { id: grantId } });
  }
  if (actorIds.length > 0) {
    await db.actorEvidenceBinding.deleteMany({ where: { actorId: { in: actorIds } } });
  }
  if (artifactIds.length > 0) {
    await db.evidenceArtifact.deleteMany({ where: { id: { in: artifactIds } } });
  }
  if (actorIds.length > 0) {
    await db.actor.deleteMany({ where: { id: { in: actorIds } } });
  }
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('semantic intent continuity', () => {
  it('preserves a human mandate across delegated authority while keeping semantic judgment separate', async () => {
    const rootActor = await createActor('root');
    const delegateActor = await createActor('delegate');
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000);
    const originalIntentDigest = `sha256:${'1'.repeat(64)}`;
    const delegatedIntentDigest = `sha256:${'2'.repeat(64)}`;

    const mandate = await registerIntentMandate(
      {
        actorId: rootActor.actorId,
        issuer: `human:${suffix}`,
        framework: 'ipp',
        principalType: 'human',
        principalRef: `user:${suffix}`,
        intentDigest: originalIntentDigest,
        issuedAt: now,
        expiresAt: expiry,
        purposeClass: 'purchase',
      },
      registry,
    );
    artifactIds.push(mandate.artifact.id);

    const rootGrant = await createAuthorityGrant(
      {
        subjectActorId: rootActor.actorId,
        grantor: { type: 'external', ref: `human:${suffix}` },
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: true,
        remainingDelegationDepth: 2,
        maxAmountMinor: '10000',
        currency: 'USD',
        notBefore: now,
        expiresAt: expiry,
        sourceEvidenceArtifactId: mandate.artifact.id,
        externalFramework: 'ipp',
        principal: { type: 'admin' },
        idempotencyKey: `intent-root-grant-${suffix}`,
        now,
      },
      registry,
    );
    grantIds.push(rootGrant.grant.id);

    const transformed = await registerIntentTransform(
      {
        actorId: delegateActor.actorId,
        issuer: `actor:${rootActor.actorId}`,
        framework: 'spice-intent-chain',
        parentArtifactId: mandate.artifact.id,
        inputDigest: originalIntentDigest,
        outputDigest: delegatedIntentDigest,
        processorType: 'actor',
        processorRef: rootActor.actorId,
        deterministic: false,
        executionId: rootActor.executionId,
        transformedAt: new Date(now.getTime() + 1_000),
      },
      registry,
    );
    artifactIds.push(transformed.artifact.id);

    const childGrant = await createAuthorityGrant(
      {
        subjectActorId: delegateActor.actorId,
        parentGrantId: rootGrant.grant.id,
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: false,
        remainingDelegationDepth: 0,
        maxAmountMinor: '2000',
        currency: 'USD',
        notBefore: new Date(now.getTime() + 1_000),
        expiresAt: new Date(expiry.getTime() - 1_000),
        sourceEvidenceArtifactId: transformed.artifact.id,
        externalFramework: 'spice-intent-chain',
        principal: { type: 'admin' },
        idempotencyKey: `intent-child-grant-${suffix}`,
        now: new Date(now.getTime() + 1_000),
      },
      registry,
    );
    grantIds.push(childGrant.grant.id);

    const verification = await verifyAuthorityIntentChain(childGrant.grant.id);
    expect(verification.valid).toBe(true);
    expect(verification.mandateArtifactId).toBe(mandate.artifact.id);
    expect(verification.terminalArtifactId).toBe(transformed.artifact.id);
    expect(verification.terminalIntentDigest).toBe(delegatedIntentDigest);
    expect(verification.actorIds).toEqual([rootActor.actorId, delegateActor.actorId]);

    const exercise = await recordAuthorityExercise(
      {
        actorId: delegateActor.actorId,
        executionId: delegateActor.executionId,
        grantId: childGrant.grant.id,
        evidenceArtifactId: transformed.artifact.id,
        action: 'purchase',
        resource: 'checkout',
        amountMinor: '1200',
        currency: 'USD',
        exercisedAt: new Date(now.getTime() + 10_000),
        idempotencyKey: `intent-exercise-${suffix}`,
      },
      registry,
    );
    exerciseIds.push(exercise.exercise.id);
    expect(exercise.exercise.coverageStatus).toBe('COVERED');

    const assessment = await registerIntentAssessment(
      {
        actorId: delegateActor.actorId,
        issuer: `evaluator:${suffix}`,
        mandateArtifactId: mandate.artifact.id,
        terminalArtifactId: transformed.artifact.id,
        authorityExerciseId: exercise.exercise.id,
        disposition: 'ALIGNED',
        evaluator: 'human-reviewer',
        method: 'semantic-review',
        methodVersion: '1',
        basisDigest: `sha256:${'3'.repeat(64)}`,
        confidenceBps: 9000,
        assessedAt: new Date(now.getTime() + 20_000),
      },
      registry,
    );
    artifactIds.push(assessment.artifact.id);
    expect(assessment.artifact.kind).toBe('noeone.intent.assessment.v1');

    const independentAssessment = await registerIntentAssessment(
      {
        actorId: delegateActor.actorId,
        issuer: `second-evaluator:${suffix}`,
        mandateArtifactId: mandate.artifact.id,
        terminalArtifactId: transformed.artifact.id,
        authorityExerciseId: exercise.exercise.id,
        disposition: 'INDETERMINATE',
        evaluator: 'model-reviewer',
        method: 'semantic-review',
        methodVersion: '1',
        basisDigest: `sha256:${'4'.repeat(64)}`,
        confidenceBps: 5200,
        assessedAt: new Date(now.getTime() + 21_000),
      },
      registry,
    );
    artifactIds.push(independentAssessment.artifact.id);

    const assessments = await db.actorEvidenceBinding.findMany({
      where: { actorId: delegateActor.actorId, role: 'intent_assessment' },
      include: { artifact: true },
    });
    expect(assessments).toHaveLength(2);
    expect(
      assessments.map((row) => (row.artifact.metadata as { disposition?: string }).disposition).sort(),
    ).toEqual(['ALIGNED', 'INDETERMINATE']);
  });

  it('rejects a transform whose declared input does not continue the predecessor digest', async () => {
    const actor = await createActor('mismatch');
    const mandate = await registerIntentMandate(
      {
        actorId: actor.actorId,
        issuer: `human-mismatch:${suffix}`,
        framework: 'ipp',
        principalType: 'human',
        principalRef: `user-mismatch:${suffix}`,
        intentDigest: `sha256:${'5'.repeat(64)}`,
      },
      registry,
    );
    artifactIds.push(mandate.artifact.id);

    await expect(
      registerIntentTransform(
        {
          actorId: actor.actorId,
          issuer: `processor:${suffix}`,
          framework: 'spice-intent-chain',
          parentArtifactId: mandate.artifact.id,
          inputDigest: `sha256:${'6'.repeat(64)}`,
          outputDigest: `sha256:${'7'.repeat(64)}`,
          processorType: 'actor',
          processorRef: actor.actorId,
          deterministic: false,
        },
        registry,
      ),
    ).rejects.toBeInstanceOf(InstitutionalConflictError);
  });
});
