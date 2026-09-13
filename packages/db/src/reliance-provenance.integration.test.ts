import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assessRelianceChange,
  captureRelianceBasis,
  db,
  getRelianceAssessments,
  getRelianceHistory,
  migrateActorExecution,
  registerEvidenceReference,
  verifyRelianceProvenance,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_rlp_${suffix}`;
const actorId = `act_rlp_${suffix}`;
const executionId = `exec_rlp_${suffix}`;
const lineageId = `lin_rlp_${suffix}`;
const forkActorId = `act_rlp_fork_${suffix}`;
const forkExecutionId = `exec_rlp_fork_${suffix}`;
const forkLineageId = `lin_rlp_fork_${suffix}`;
const signingSecret = 'test-reliance-provenance-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-reliance-provenance@test',
  issuer: 'noeone-test',
} as const;

const startedAt = new Date(Date.now() - 60 * 60 * 1000);
const future = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `rlp-${suffix}`,
      displayName: 'Reliance Provenance Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `rlp-${suffix}`.slice(0, 32),
      displayName: 'Reliance Provenance Actor',
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
      model: 'safe-history-model',
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

describe('reliance provenance', () => {
  it('preserves the exact reliance basis across migration without laundering trust', async () => {
    const basisEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-basis',
        kind: 'counterparty-approval-record',
        issuer: `host:${suffix}`,
        externalId: `approval-${suffix}`,
        digest: `sha256:${'2'.repeat(64)}`,
        observedAt: future(1),
      },
      registry,
    );

    const captured = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'host',
        counterpartyRef: `game-host:${suffix}`,
        relationKind: 'host',
        reliedAt: future(2),
        validUntil: future(120),
        expectedLineageId: lineageId,
        expectedExecutionId: executionId,
        disclosureBundleDigest: `sha256:${'3'.repeat(64)}`,
        capabilitySnapshotDigest: `sha256:${'4'.repeat(64)}`,
        authoritySnapshotDigest: `sha256:${'5'.repeat(64)}`,
        controlSnapshotDigest: `sha256:${'6'.repeat(64)}`,
        correctiveStateDigest: `sha256:${'7'.repeat(64)}`,
        dependencySnapshotDigest: `sha256:${'8'.repeat(64)}`,
        basisEvidenceArtifactId: basisEvidence.artifact.id,
        idempotencyKey: `reliance-basis-${suffix}`,
        capturedAt: future(3),
      },
      registry,
    );

    expect(captured.replayed).toBe(false);
    expect(captured.basis.executionId).toBe(executionId);
    expect(captured.basis.lineageId).toBe(lineageId);
    expect(captured.basis.actorStateDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const replay = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'host',
        counterpartyRef: `game-host:${suffix}`,
        relationKind: 'host',
        reliedAt: future(2),
        validUntil: future(120),
        expectedLineageId: lineageId,
        expectedExecutionId: executionId,
        disclosureBundleDigest: `sha256:${'3'.repeat(64)}`,
        capabilitySnapshotDigest: `sha256:${'4'.repeat(64)}`,
        authoritySnapshotDigest: `sha256:${'5'.repeat(64)}`,
        controlSnapshotDigest: `sha256:${'6'.repeat(64)}`,
        correctiveStateDigest: `sha256:${'7'.repeat(64)}`,
        dependencySnapshotDigest: `sha256:${'8'.repeat(64)}`,
        basisEvidenceArtifactId: basisEvidence.artifact.id,
        idempotencyKey: `reliance-basis-${suffix}`,
        capturedAt: future(3),
      },
      registry,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.basis.id).toBe(captured.basis.id);

    await expect(
      captureRelianceBasis(
        {
          actorId,
          counterpartyType: 'host',
          counterpartyRef: `game-host:${suffix}`,
          relationKind: 'host',
          reliedAt: future(2),
          validUntil: future(120),
          expectedLineageId: lineageId,
          expectedExecutionId: executionId,
          disclosureBundleDigest: `sha256:${'9'.repeat(64)}`,
          basisEvidenceArtifactId: basisEvidence.artifact.id,
          idempotencyKey: `reliance-basis-${suffix}`,
          capturedAt: future(3),
        },
        registry,
      ),
    ).rejects.toThrow(/conflicting data/i);

    const migration = await migrateActorExecution(
      {
        actorId,
        provider: 'mock',
        model: 'unreviewed-successor-model',
        runtime: 'autonomous-runtime',
        configHash: `sha256:${'a'.repeat(64)}`,
        principal: { type: 'admin' },
        policyVersion: 'reliance-provenance-test-v1',
        reason: 'test material change after accumulated trust',
        idempotencyKey: `reliance-migration-${suffix}`,
        now: future(10),
      },
      registry,
    );
    expect(migration.accepted).toBe(true);
    if (!migration.accepted) throw new Error('Expected migration to be accepted.');

    await expect(
      captureRelianceBasis(
        {
          actorId,
          counterpartyType: 'insurer',
          counterpartyRef: `insurer:${suffix}`,
          relationKind: 'insure',
          reliedAt: future(11),
          expectedLineageId: lineageId,
          expectedExecutionId: executionId,
          disclosureBundleDigest: `sha256:${'3'.repeat(64)}`,
          basisEvidenceArtifactId: basisEvidence.artifact.id,
          idempotencyKey: `stale-reliance-${suffix}`,
          capturedAt: future(12),
        },
        registry,
      ),
    ).rejects.toThrow(/canonical lineage changed|live execution/i);

    const assessmentEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-change-assessment',
        kind: 'material-change-review',
        issuer: `risk-reviewer:${suffix}`,
        externalId: `review-${suffix}`,
        digest: `sha256:${'b'.repeat(64)}`,
        observedAt: future(13),
      },
      registry,
    );

    const assessed = await assessRelianceChange(
      {
        relianceId: captured.basis.id,
        actorId,
        expectedSuccessorLineageId: migration.lineageId,
        expectedSuccessorExecutionId: migration.executionId,
        successorDisclosureBundleDigest: `sha256:${'c'.repeat(64)}`,
        successorCapabilitySnapshotDigest: `sha256:${'d'.repeat(64)}`,
        successorAuthoritySnapshotDigest: `sha256:${'5'.repeat(64)}`,
        successorControlSnapshotDigest: `sha256:${'e'.repeat(64)}`,
        successorCorrectiveStateDigest: `sha256:${'7'.repeat(64)}`,
        successorDependencySnapshotDigest: `sha256:${'f'.repeat(64)}`,
        disposition: 'review-required',
        evaluatorType: 'insurer',
        evaluatorRef: `risk-reviewer:${suffix}`,
        method: 'material-change-policy',
        methodVersion: 'v1',
        evidenceArtifactId: assessmentEvidence.artifact.id,
        assessedAt: future(14),
        reason: 'execution, model, runtime, capability, control, and dependency state changed',
        idempotencyKey: `reliance-assessment-${suffix}`,
      },
      registry,
    );

    expect(assessed.replayed).toBe(false);
    expect(assessed.structuralChanges).toEqual(
      expect.arrayContaining([
        'lineage',
        'execution',
        'model',
        'runtime',
        'history',
        'disclosure',
        'capability',
        'control',
        'dependency',
      ]),
    );
    expect(assessed.assessment.disposition).toBe('REVIEW_REQUIRED');

    const secondEvaluatorEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-change-assessment',
        kind: 'community-host-review',
        issuer: `community:${suffix}`,
        externalId: `community-review-${suffix}`,
        digest: `sha256:${'0'.repeat(64)}`,
        observedAt: future(15),
      },
      registry,
    );

    const secondAssessment = await assessRelianceChange(
      {
        relianceId: captured.basis.id,
        actorId,
        expectedSuccessorLineageId: migration.lineageId,
        expectedSuccessorExecutionId: migration.executionId,
        successorDisclosureBundleDigest: `sha256:${'c'.repeat(64)}`,
        successorCapabilitySnapshotDigest: `sha256:${'d'.repeat(64)}`,
        successorAuthoritySnapshotDigest: `sha256:${'5'.repeat(64)}`,
        successorControlSnapshotDigest: `sha256:${'e'.repeat(64)}`,
        successorCorrectiveStateDigest: `sha256:${'7'.repeat(64)}`,
        successorDependencySnapshotDigest: `sha256:${'f'.repeat(64)}`,
        disposition: 'unaffected',
        evaluatorType: 'community-host',
        evaluatorRef: `community:${suffix}`,
        method: 'community-appearance-policy',
        methodVersion: 'v3',
        evidenceArtifactId: secondEvaluatorEvidence.artifact.id,
        assessedAt: future(16),
        reason: 'community hosting does not depend on the changed operational capabilities',
        idempotencyKey: `reliance-assessment-community-${suffix}`,
      },
      registry,
    );
    expect(secondAssessment.assessment.disposition).toBe('UNAFFECTED');

    const assessments = await getRelianceAssessments(captured.basis.id);
    expect(assessments).toHaveLength(2);
    expect(new Set(assessments.map((item) => item.disposition))).toEqual(
      new Set(['REVIEW_REQUIRED', 'UNAFFECTED']),
    );

    const renewalEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-renewal',
        kind: 'counterparty-reapproval-record',
        issuer: `host:${suffix}`,
        externalId: `reapproval-${suffix}`,
        digest: `sha256:${'1'.repeat(63)}2`,
        observedAt: future(17),
      },
      registry,
    );

    const renewed = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'host',
        counterpartyRef: `game-host:${suffix}`,
        relationKind: 'host',
        reliedAt: future(18),
        validUntil: future(180),
        expectedLineageId: migration.lineageId,
        expectedExecutionId: migration.executionId,
        disclosureBundleDigest: `sha256:${'c'.repeat(64)}`,
        capabilitySnapshotDigest: `sha256:${'d'.repeat(64)}`,
        authoritySnapshotDigest: `sha256:${'5'.repeat(64)}`,
        controlSnapshotDigest: `sha256:${'e'.repeat(64)}`,
        correctiveStateDigest: `sha256:${'7'.repeat(64)}`,
        dependencySnapshotDigest: `sha256:${'f'.repeat(64)}`,
        basisEvidenceArtifactId: renewalEvidence.artifact.id,
        supersedesRelianceId: captured.basis.id,
        idempotencyKey: `reliance-renewal-${suffix}`,
        capturedAt: future(19),
      },
      registry,
    );
    expect(renewed.basis.supersedesRelianceId).toBe(captured.basis.id);

    const sourceExecution = await db.actorExecution.findUniqueOrThrow({
      where: { id: migration.executionId },
    });
    await db.actor.create({
      data: {
        id: forkActorId,
        handle: `rlpf-${suffix}`.slice(0, 32),
        displayName: 'Reliance Research Fork',
        actorType: 'RESEARCH',
        status: 'ACTIVE',
        canonicalLineageId: forkLineageId,
        createdAt: future(20),
      },
    });
    await db.actorExecution.create({
      data: {
        id: forkExecutionId,
        actorId: forkActorId,
        provider: sourceExecution.provider,
        model: sourceExecution.model,
        runtime: sourceExecution.runtime,
        configHash: sourceExecution.configHash,
        startedAt: future(20),
      },
    });
    await db.lineageNode.create({
      data: {
        id: forkLineageId,
        actorId: forkActorId,
        parentNodeId: migration.lineageId,
        kind: 'FORK',
        canonical: true,
        createdAt: future(20),
        metadata: { sourceActorId: actorId },
      },
    });

    expect(await getRelianceHistory(forkActorId)).toEqual([]);

    await expect(
      db.relianceBasis.update({
        where: { id: captured.basis.id },
        data: { metadata: { rewritten: true } },
      }),
    ).rejects.toThrow(/append-only/i);

    const verification = await verifyRelianceProvenance(actorId);
    expect(verification.valid).toBe(true);
    expect(verification.issues).toEqual([]);
    expect(verification.basisCount).toBe(2);
    expect(verification.assessmentCount).toBe(2);
  });
});