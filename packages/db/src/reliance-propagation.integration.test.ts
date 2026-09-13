import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assessRelianceChange,
  assessReliancePropagation,
  buildRelianceExposureReport,
  captureRelianceBasis,
  db,
  migrateActorExecution,
  registerEvidenceReference,
  registerRelianceDependency,
  verifyReliancePropagation,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_rpg_${suffix}`;
const actorId = `act_rpg_${suffix}`;
const executionId = `exec_rpg_${suffix}`;
const lineageId = `lin_rpg_${suffix}`;
const signingSecret = 'test-reliance-propagation-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-reliance-propagation@test',
  issuer: 'noeone-test',
} as const;

const baseTime = Date.now();
const startedAt = new Date(baseTime - 60 * 60 * 1000);
const future = (minutes: number) => new Date(baseTime + minutes * 60 * 1000);

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `rpg-${suffix}`,
      displayName: 'Reliance Propagation Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `rpg-${suffix}`.slice(0, 32),
      displayName: 'Reliance Propagation Actor',
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
      model: 'propagation-model-v1',
      runtime: 'restricted-runtime',
      configHash: `sha256:${'1'.repeat(64)}`,
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
  await db.$disconnect();
});

async function evidence(role: string, marker: string, minute: number) {
  return registerEvidenceReference(
    {
      actorId,
      role,
      kind: role,
      issuer: `institution:${suffix}`,
      externalId: `${role}-${suffix}-${marker}`,
      digest: `sha256:${marker.repeat(64)}`,
      observedAt: future(minute),
    },
    registry,
  );
}

describe('reliance propagation', () => {
  it('records a DAG of decision dependencies without laundering transitive trust', async () => {
    const upstreamEvidence = await evidence('upstream-reliance', '2', 1);
    const upstream = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'auditor',
        counterpartyRef: `auditor:${suffix}`,
        relationKind: 'certify',
        reliedAt: future(2),
        expectedLineageId: lineageId,
        expectedExecutionId: executionId,
        disclosureBundleDigest: `sha256:${'3'.repeat(64)}`,
        basisEvidenceArtifactId: upstreamEvidence.artifact.id,
        idempotencyKey: `upstream-reliance-${suffix}`,
        capturedAt: future(3),
      },
      registry,
    );

    const middleEvidence = await evidence('middle-reliance', '4', 4);
    const middle = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'insurer',
        counterpartyRef: `insurer:${suffix}`,
        relationKind: 'insure',
        reliedAt: future(5),
        expectedLineageId: lineageId,
        expectedExecutionId: executionId,
        disclosureBundleDigest: `sha256:${'5'.repeat(64)}`,
        basisEvidenceArtifactId: middleEvidence.artifact.id,
        idempotencyKey: `middle-reliance-${suffix}`,
        capturedAt: future(6),
      },
      registry,
    );

    const downstreamEvidence = await evidence('downstream-reliance', '6', 7);
    const downstream = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'enterprise',
        counterpartyRef: `enterprise:${suffix}`,
        relationKind: 'authorize',
        reliedAt: future(8),
        expectedLineageId: lineageId,
        expectedExecutionId: executionId,
        disclosureBundleDigest: `sha256:${'7'.repeat(64)}`,
        basisEvidenceArtifactId: downstreamEvidence.artifact.id,
        idempotencyKey: `downstream-reliance-${suffix}`,
        capturedAt: future(9),
      },
      registry,
    );

    const depEvidence1 = await evidence('reliance-dependency', '8', 10);
    const first = await registerRelianceDependency(
      {
        actorId,
        downstreamRelianceId: middle.basis.id,
        upstreamRelianceId: upstream.basis.id,
        dependencyKind: 'required',
        expectedUpstreamBasisDigest: upstream.basis.basisDigest,
        expectedDownstreamBasisDigest: middle.basis.basisDigest,
        evidenceArtifactId: depEvidence1.artifact.id,
        createdByType: 'insurer',
        createdByRef: `insurer:${suffix}`,
        idempotencyKey: `dependency-one-${suffix}`,
      },
      registry,
    );

    expect(first.replayed).toBe(false);
    expect(first.dependency.dependencyDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const replay = await registerRelianceDependency(
      {
        actorId,
        downstreamRelianceId: middle.basis.id,
        upstreamRelianceId: upstream.basis.id,
        dependencyKind: 'required',
        expectedUpstreamBasisDigest: upstream.basis.basisDigest,
        expectedDownstreamBasisDigest: middle.basis.basisDigest,
        evidenceArtifactId: depEvidence1.artifact.id,
        createdByType: 'insurer',
        createdByRef: `insurer:${suffix}`,
        idempotencyKey: `dependency-one-${suffix}`,
      },
      registry,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.dependency.id).toBe(first.dependency.id);

    const depEvidence2 = await evidence('reliance-dependency', '9', 11);
    const second = await registerRelianceDependency(
      {
        actorId,
        downstreamRelianceId: downstream.basis.id,
        upstreamRelianceId: middle.basis.id,
        dependencyKind: 'material',
        expectedUpstreamBasisDigest: middle.basis.basisDigest,
        expectedDownstreamBasisDigest: downstream.basis.basisDigest,
        evidenceArtifactId: depEvidence2.artifact.id,
        createdByType: 'enterprise',
        createdByRef: `enterprise:${suffix}`,
        idempotencyKey: `dependency-two-${suffix}`,
      },
      registry,
    );
    expect(second.replayed).toBe(false);

    const exposure = await buildRelianceExposureReport(upstream.basis.id);
    expect(exposure.actorId).toBe(actorId);
    expect(exposure.affectedCount).toBe(2);
    expect(exposure.affected.map((item) => item.relianceId)).toEqual([
      middle.basis.id,
      downstream.basis.id,
    ]);
    expect(exposure.affected[0]?.depth).toBe(1);
    expect(exposure.affected[1]?.depth).toBe(2);
    expect(exposure.semantics.trustIsTransitive).toBe(false);
    expect(exposure.semantics.downstreamValidityIsAutomatic).toBe(false);

    const cycleEvidence = await evidence('reliance-dependency', 'a', 12);
    await expect(
      registerRelianceDependency(
        {
          actorId,
          downstreamRelianceId: upstream.basis.id,
          upstreamRelianceId: downstream.basis.id,
          dependencyKind: 'informative',
          expectedUpstreamBasisDigest: downstream.basis.basisDigest,
          expectedDownstreamBasisDigest: upstream.basis.basisDigest,
          evidenceArtifactId: cycleEvidence.artifact.id,
          createdByType: 'auditor',
          createdByRef: `auditor:${suffix}`,
          idempotencyKey: `cycle-dependency-${suffix}`,
        },
        registry,
      ),
    ).rejects.toThrow(/postdate|cycle/i);

    const migration = await migrateActorExecution(
      {
        actorId,
        provider: 'mock',
        model: 'propagation-model-v2',
        runtime: 'autonomous-runtime',
        configHash: `sha256:${'b'.repeat(64)}`,
        principal: { type: 'admin' },
        policyVersion: 'reliance-propagation-test-v1',
        reason: 'material execution change',
        idempotencyKey: `propagation-migration-${suffix}`,
        now: future(20),
      },
      registry,
    );
    expect(migration.accepted).toBe(true);
    if (!migration.accepted) throw new Error('Expected migration to be accepted.');

    const changeEvidence = await evidence('reliance-change-assessment', 'c', 21);
    const change = await assessRelianceChange(
      {
        relianceId: upstream.basis.id,
        actorId,
        expectedSuccessorLineageId: migration.lineageId,
        expectedSuccessorExecutionId: migration.executionId,
        successorDisclosureBundleDigest: `sha256:${'d'.repeat(64)}`,
        disposition: 'review-required',
        evaluatorType: 'auditor',
        evaluatorRef: `auditor:${suffix}`,
        method: 'material-change-review',
        methodVersion: 'v1',
        evidenceArtifactId: changeEvidence.artifact.id,
        assessedAt: future(22),
        reason: 'model and runtime changed',
        idempotencyKey: `upstream-change-${suffix}`,
      },
      registry,
    );

    const propagationEvidence = await evidence('reliance-propagation-assessment', 'e', 23);
    const propagation = await assessReliancePropagation(
      {
        actorId,
        dependencyId: first.dependency.id,
        downstreamRelianceId: middle.basis.id,
        triggerRelianceId: upstream.basis.id,
        triggerAssessmentId: change.assessment.id,
        expectedTriggerDigest: change.assessment.basisDigest,
        expectedDependencyDigest: first.dependency.dependencyDigest,
        expectedDownstreamBasisDigest: middle.basis.basisDigest,
        disposition: 'review-required',
        evaluatorType: 'insurer',
        evaluatorRef: `insurer:${suffix}`,
        method: 'upstream-change-impact',
        methodVersion: 'v1',
        evidenceArtifactId: propagationEvidence.artifact.id,
        reason: 'underwriting relied on the auditor state now under review',
        assessedAt: future(24),
        idempotencyKey: `propagation-assessment-${suffix}`,
      },
      registry,
    );

    expect(propagation.replayed).toBe(false);
    expect(propagation.assessment.disposition).toBe('REVIEW_REQUIRED');

    const afterAssessment = await buildRelianceExposureReport(upstream.basis.id);
    expect(afterAssessment.affected[0]?.latestDisposition).toBe('review-required');
    expect(afterAssessment.affected[1]?.latestDisposition).toBeUndefined();

    const verification = await verifyReliancePropagation(actorId);
    expect(verification.valid, verification.issues.join('\n')).toBe(true);
    expect(verification.dependencyCount).toBe(2);
    expect(verification.assessmentCount).toBe(1);

    await expect(
      db.relianceDependency.update({
        where: { id: first.dependency.id },
        data: { createdByRef: 'mutated' },
      }),
    ).rejects.toThrow(/append-only/i);
  });
});
