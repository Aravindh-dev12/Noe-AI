import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assessRelianceChange,
  captureRelianceBasis,
  db,
  emitRelianceSignal,
  getActorRelianceBlastRadius,
  getRelianceSignalReceipts,
  getRelianceSignals,
  migrateActorExecution,
  recordRelianceSignalReceipt,
  registerEvidenceReference,
  verifyRelianceSignalProvenance,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_rls_${suffix}`;
const actorId = `act_rls_${suffix}`;
const executionId = `exec_rls_${suffix}`;
const lineageId = `lin_rls_${suffix}`;
const signingSecret = 'test-reliance-signals-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-reliance-signals@test',
  issuer: 'noeone-test',
} as const;

const baseTime = Date.now();
const startedAt = new Date(baseTime - 60 * 60 * 1000);
const future = (minutes: number) => new Date(baseTime + minutes * 60 * 1000);

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `rls-${suffix}`,
      displayName: 'Reliance Signal Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `rls-${suffix}`.slice(0, 32),
      displayName: 'Reliance Signal Actor',
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
      model: 'trusted-model-v1',
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

describe('reliance signal propagation', () => {
  it('preserves change propagation, response attribution, renewal, and blast radius', async () => {
    const basisEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-basis',
        kind: 'host-approval',
        issuer: `host:${suffix}`,
        externalId: `approval-${suffix}`,
        digest: `sha256:${'2'.repeat(64)}`,
        observedAt: future(1),
      },
      registry,
    );

    const basis = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'host',
        counterpartyRef: `world:${suffix}`,
        relationKind: 'host',
        reliedAt: future(2),
        validUntil: future(180),
        expectedLineageId: lineageId,
        expectedExecutionId: executionId,
        disclosureBundleDigest: `sha256:${'3'.repeat(64)}`,
        capabilitySnapshotDigest: `sha256:${'4'.repeat(64)}`,
        authoritySnapshotDigest: `sha256:${'5'.repeat(64)}`,
        basisEvidenceArtifactId: basisEvidence.artifact.id,
        idempotencyKey: `signal-basis-${suffix}`,
        capturedAt: future(3),
      },
      registry,
    );

    const migration = await migrateActorExecution(
      {
        actorId,
        provider: 'mock',
        model: 'changed-model-v2',
        runtime: 'expanded-runtime',
        configHash: `sha256:${'6'.repeat(64)}`,
        principal: { type: 'admin' },
        policyVersion: 'reliance-signals-test-v1',
        reason: 'material state change',
        idempotencyKey: `signal-migration-${suffix}`,
        now: future(10),
      },
      registry,
    );
    expect(migration.accepted).toBe(true);
    if (!migration.accepted) throw new Error('Expected migration acceptance.');

    const assessmentEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-change-assessment',
        kind: 'host-material-change-review',
        issuer: `reviewer:${suffix}`,
        externalId: `review-${suffix}`,
        digest: `sha256:${'7'.repeat(64)}`,
        observedAt: future(11),
      },
      registry,
    );

    const assessment = await assessRelianceChange(
      {
        relianceId: basis.basis.id,
        actorId,
        expectedSuccessorLineageId: migration.lineageId,
        expectedSuccessorExecutionId: migration.executionId,
        successorDisclosureBundleDigest: `sha256:${'8'.repeat(64)}`,
        successorCapabilitySnapshotDigest: `sha256:${'9'.repeat(64)}`,
        successorAuthoritySnapshotDigest: `sha256:${'a'.repeat(64)}`,
        disposition: 'review-required',
        evaluatorType: 'host-policy',
        evaluatorRef: `world:${suffix}`,
        method: 'material-change-policy',
        methodVersion: '1',
        evidenceArtifactId: assessmentEvidence.artifact.id,
        assessedAt: future(12),
        reason: 'model, runtime, disclosure, capability, and authority changed',
        idempotencyKey: `signal-assessment-${suffix}`,
      },
      registry,
    );

    const emitted = await emitRelianceSignal(
      {
        assessmentId: assessment.assessment.id,
        transportProfile: 'ssf',
        transportRef: `stream:${suffix}`,
        emittedAt: future(13),
        idempotencyKey: `reliance-signal-${suffix}`,
      },
      registry,
    );
    expect(emitted.replayed).toBe(false);
    expect(emitted.signal.actorId).toBe(actorId);
    expect(emitted.signal.relianceId).toBe(basis.basis.id);
    expect(emitted.signal.counterpartyRef).toBe(`world:${suffix}`);
    expect(emitted.signal.disposition).toBe('REVIEW_REQUIRED');

    const replay = await emitRelianceSignal(
      {
        assessmentId: assessment.assessment.id,
        transportProfile: 'ssf',
        transportRef: `stream:${suffix}`,
        emittedAt: future(13),
        idempotencyKey: `reliance-signal-${suffix}`,
      },
      registry,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.signal.id).toBe(emitted.signal.id);

    await expect(
      emitRelianceSignal(
        {
          assessmentId: assessment.assessment.id,
          transportProfile: 'webhook',
          transportRef: `different:${suffix}`,
          emittedAt: future(13),
          idempotencyKey: `reliance-signal-${suffix}`,
        },
        registry,
      ),
    ).rejects.toThrow(/conflicting data/i);

    const deliveryEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-signal-delivery',
        kind: 'ssf-delivery-proof',
        issuer: `transport:${suffix}`,
        externalId: `delivery-${suffix}`,
        digest: `sha256:${'b'.repeat(64)}`,
        observedAt: future(14),
      },
      registry,
    );

    const delivered = await recordRelianceSignalReceipt(
      {
        signalId: emitted.signal.id,
        kind: 'delivered',
        partyType: 'transport',
        partyRef: `ssf:${suffix}`,
        evidenceArtifactId: deliveryEvidence.artifact.id,
        observedAt: future(15),
        idempotencyKey: `signal-delivered-${suffix}`,
      },
      registry,
    );
    expect(delivered.replayed).toBe(false);

    let snapshot = await getActorRelianceBlastRadius(actorId);
    expect(snapshot.propagation.delivered).toBe(1);
    expect(snapshot.propagation.acknowledged).toBe(0);
    expect(snapshot.propagation.renewed).toBe(0);
    expect(snapshot.propagation.unresolved).toBe(1);

    const acknowledgementEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-signal-acknowledgement',
        kind: 'counterparty-acknowledgement',
        issuer: `world:${suffix}`,
        externalId: `ack-${suffix}`,
        digest: `sha256:${'c'.repeat(64)}`,
        observedAt: future(16),
      },
      registry,
    );

    await expect(
      recordRelianceSignalReceipt(
        {
          signalId: emitted.signal.id,
          kind: 'acknowledged',
          partyType: 'transport',
          partyRef: `ssf:${suffix}`,
          evidenceArtifactId: acknowledgementEvidence.artifact.id,
          observedAt: future(17),
          idempotencyKey: `bad-ack-${suffix}`,
        },
        registry,
      ),
    ).rejects.toThrow(/original relying counterparty/i);

    await recordRelianceSignalReceipt(
      {
        signalId: emitted.signal.id,
        kind: 'acknowledged',
        partyType: 'host',
        partyRef: `world:${suffix}`,
        evidenceArtifactId: acknowledgementEvidence.artifact.id,
        observedAt: future(18),
        idempotencyKey: `signal-ack-${suffix}`,
      },
      registry,
    );

    snapshot = await getActorRelianceBlastRadius(actorId);
    expect(snapshot.dispositions.reviewRequired).toBe(1);
    expect(snapshot.propagation.acknowledged).toBe(1);
    expect(snapshot.propagation.unresolved).toBe(1);

    const unrelatedEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-basis',
        kind: 'unrelated-approval',
        issuer: `other:${suffix}`,
        externalId: `other-${suffix}`,
        digest: `sha256:${'d'.repeat(64)}`,
        observedAt: future(19),
      },
      registry,
    );
    const unrelated = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'insurer',
        counterpartyRef: `insurer:${suffix}`,
        relationKind: 'insure',
        reliedAt: future(20),
        expectedLineageId: migration.lineageId,
        expectedExecutionId: migration.executionId,
        disclosureBundleDigest: `sha256:${'e'.repeat(64)}`,
        basisEvidenceArtifactId: unrelatedEvidence.artifact.id,
        idempotencyKey: `unrelated-basis-${suffix}`,
        capturedAt: future(21),
      },
      registry,
    );

    const renewalEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'reliance-renewal',
        kind: 'renewed-host-approval',
        issuer: `world:${suffix}`,
        externalId: `renew-${suffix}`,
        digest: `sha256:${'f'.repeat(64)}`,
        observedAt: future(22),
      },
      registry,
    );
    const renewedBasis = await captureRelianceBasis(
      {
        actorId,
        counterpartyType: 'host',
        counterpartyRef: `world:${suffix}`,
        relationKind: 'host',
        reliedAt: future(23),
        validUntil: future(300),
        expectedLineageId: migration.lineageId,
        expectedExecutionId: migration.executionId,
        disclosureBundleDigest: `sha256:${'8'.repeat(64)}`,
        capabilitySnapshotDigest: `sha256:${'9'.repeat(64)}`,
        authoritySnapshotDigest: `sha256:${'a'.repeat(64)}`,
        basisEvidenceArtifactId: renewalEvidence.artifact.id,
        supersedesRelianceId: basis.basis.id,
        idempotencyKey: `renewed-basis-${suffix}`,
        capturedAt: future(24),
      },
      registry,
    );

    await expect(
      recordRelianceSignalReceipt(
        {
          signalId: emitted.signal.id,
          kind: 'reliance-renewed',
          partyType: 'host',
          partyRef: `world:${suffix}`,
          evidenceArtifactId: renewalEvidence.artifact.id,
          successorRelianceId: unrelated.basis.id,
          observedAt: future(25),
          idempotencyKey: `bad-renewal-${suffix}`,
        },
        registry,
      ),
    ).rejects.toThrow(/supersede|counterparty/i);

    await recordRelianceSignalReceipt(
      {
        signalId: emitted.signal.id,
        kind: 'reliance-renewed',
        partyType: 'host',
        partyRef: `world:${suffix}`,
        evidenceArtifactId: renewalEvidence.artifact.id,
        successorRelianceId: renewedBasis.basis.id,
        observedAt: future(26),
        idempotencyKey: `signal-renewed-${suffix}`,
      },
      registry,
    );

    const receipts = await getRelianceSignalReceipts(emitted.signal.id);
    expect(receipts.map((receipt) => receipt.kind)).toEqual([
      'delivered',
      'acknowledged',
      'reliance-renewed',
    ]);

    const signals = await getRelianceSignals(actorId);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.projection.renewed).toBe(true);
    expect(signals[0]?.projection.terminal).toBe('renewed');

    snapshot = await getActorRelianceBlastRadius(actorId);
    expect(snapshot.propagation.renewed).toBe(1);
    expect(snapshot.propagation.unresolved).toBe(0);

    const verification = await verifyRelianceSignalProvenance(actorId);
    expect(verification.valid).toBe(true);
    expect(verification.signalCount).toBe(1);
    expect(verification.receiptCount).toBe(3);
    expect(verification.issues).toEqual([]);

    await expect(
      db.relianceSignal.update({
        where: { id: emitted.signal.id },
        data: { transportRef: 'tampered' },
      }),
    ).rejects.toThrow(/append-only/i);
  });
});
