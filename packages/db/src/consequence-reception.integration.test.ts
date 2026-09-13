import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  activeAuthorityConstraintsAt,
  activeConsequenceReceptionsAt,
  db,
  issueConsequenceReception,
  migrateActorExecution,
  recordConsequenceAttribution,
  recordConsequenceObservation,
  registerEvidenceReference,
  transitionConsequenceReception,
  verifyConsequenceReceptionState,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_crx_${suffix}`;
const actorId = `act_crx_${suffix}`;
const executionId = `exec_crx_${suffix}`;
const lineageId = `lin_crx_${suffix}`;
const forkActorId = `act_crx_fork_${suffix}`;
const forkExecutionId = `exec_crx_fork_${suffix}`;
const forkLineageId = `lin_crx_fork_${suffix}`;
const signingSecret = 'test-consequence-reception-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-consequence-reception@test',
  issuer: 'noeone-test',
} as const;

beforeAll(async () => {
  const startedAt = new Date('2026-09-13T08:00:00.000Z');
  await db.host.create({
    data: {
      id: hostId,
      slug: `crx-${suffix}`,
      displayName: 'Consequence Reception Test Registry',
      status: 'active',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `crx-${suffix}`.slice(0, 32),
      displayName: 'Corrective State Actor',
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
      model: 'model-before-restriction',
      runtime: 'runtime-a',
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

describe('consequence reception continuity', () => {
  it('survives execution migration, does not silently inherit across a fork, and requires explicit restoration evidence', async () => {
    const observedAt = new Date('2026-09-13T09:00:00.000Z');
    const effectiveAt = new Date('2026-09-13T10:00:00.000Z');

    const sourceEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'outcome-subject',
        kind: 'incident-settlement-record',
        issuer: `settlement:${suffix}`,
        externalId: `settlement-${suffix}`,
        digest: `sha256:${'2'.repeat(64)}`,
        observedAt,
      },
      registry,
    );
    const authorityEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'governance-authority',
        kind: 'corrective-authority-record',
        issuer: `risk-board:${suffix}`,
        externalId: `authority-${suffix}`,
        digest: `sha256:${'3'.repeat(64)}`,
        observedAt,
      },
      registry,
    );

    const observation = await recordConsequenceObservation({
      kind: 'financial-loss',
      sourceEvidenceArtifactId: sourceEvidence.artifact.id,
      occurredAt: observedAt,
      valueMinor: '75000',
      currency: 'USD',
      externalFramework: 'test-settlement',
      externalReference: `loss:${suffix}`,
      idempotencyKey: `crx-observation-${suffix}`,
    });
    const attribution = await recordConsequenceAttribution(
      {
        consequenceId: observation.observation.id,
        actorId,
        assessmentType: 'responsibility',
        disposition: 'SUPPORTED',
        method: 'test-adjudication',
        methodVersion: 'v1',
        evaluator: `risk-board:${suffix}`,
        sourceEvidenceArtifactId: sourceEvidence.artifact.id,
        idempotencyKey: `crx-attribution-${suffix}`,
      },
      registry,
    );

    const issued = await issueConsequenceReception(
      {
        actorId,
        sourceConsequenceId: observation.observation.id,
        sourceAttributionId: attribution.attribution.id,
        sourceEvidenceArtifactId: sourceEvidence.artifact.id,
        kind: 'restriction',
        scope: {
          global: false,
          actions: ['purchase'],
          resources: ['checkout'],
          capabilities: [],
          environmentRefs: [],
        },
        termsDigest: `sha256:${'4'.repeat(64)}`,
        restorationCriteriaDigest: `sha256:${'5'.repeat(64)}`,
        effectiveAt,
        reviewAt: new Date('2026-09-20T10:00:00.000Z'),
        expiresAt: new Date('2026-10-13T10:00:00.000Z'),
        issuedByType: 'organization',
        issuedByRef: `risk-board:${suffix}`,
        authorityEvidenceArtifactId: authorityEvidence.artifact.id,
        idempotencyKey: `crx-issue-${suffix}`,
      },
      registry,
    );
    expect(issued.replayed).toBe(false);
    expect(issued.reception.status).toBe('ACTIVE');

    const replay = await issueConsequenceReception(
      {
        actorId,
        sourceConsequenceId: observation.observation.id,
        sourceAttributionId: attribution.attribution.id,
        sourceEvidenceArtifactId: sourceEvidence.artifact.id,
        kind: 'restriction',
        scope: {
          global: false,
          actions: ['purchase'],
          resources: ['checkout'],
          capabilities: [],
          environmentRefs: [],
        },
        termsDigest: `sha256:${'4'.repeat(64)}`,
        restorationCriteriaDigest: `sha256:${'5'.repeat(64)}`,
        effectiveAt,
        reviewAt: new Date('2026-09-20T10:00:00.000Z'),
        expiresAt: new Date('2026-10-13T10:00:00.000Z'),
        issuedByType: 'organization',
        issuedByRef: `risk-board:${suffix}`,
        authorityEvidenceArtifactId: authorityEvidence.artifact.id,
        idempotencyKey: `crx-issue-${suffix}`,
      },
      registry,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.reception.id).toBe(issued.reception.id);

    const beforeMigration = await activeAuthorityConstraintsAt(
      actorId,
      new Date('2026-09-13T10:30:00.000Z'),
      { action: 'purchase', resource: 'checkout' },
    );
    expect(beforeMigration.map((item) => item.id)).toEqual([issued.reception.id]);

    const migration = await migrateActorExecution(
      {
        actorId,
        provider: 'mock',
        model: 'model-after-restriction',
        runtime: 'runtime-b',
        configHash: `sha256:${'6'.repeat(64)}`,
        principal: { type: 'admin' },
        policyVersion: 'test-continuity-v1',
        reason: 'prove corrective state is actor-level',
        idempotencyKey: `crx-migration-${suffix}`,
        now: new Date('2026-09-13T11:00:00.000Z'),
      },
      registry,
    );
    expect(migration.accepted).toBe(true);

    const afterMigration = await activeAuthorityConstraintsAt(
      actorId,
      new Date('2026-09-13T11:30:00.000Z'),
      { action: 'purchase', resource: 'checkout' },
    );
    expect(afterMigration.map((item) => item.id)).toEqual([issued.reception.id]);

    const sourceActor = await db.actor.findUniqueOrThrow({ where: { id: actorId } });
    const sourceExecution = await db.actorExecution.findFirstOrThrow({
      where: { actorId, endedAt: null },
    });
    await db.actor.create({
      data: {
        id: forkActorId,
        handle: `crxf-${suffix}`.slice(0, 32),
        displayName: 'Corrective State Research Fork',
        actorType: 'RESEARCH',
        status: 'ACTIVE',
        canonicalLineageId: forkLineageId,
        createdAt: new Date('2026-09-13T12:00:00.000Z'),
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
        startedAt: new Date('2026-09-13T12:00:00.000Z'),
      },
    });
    await db.lineageNode.create({
      data: {
        id: forkLineageId,
        actorId: forkActorId,
        parentNodeId: sourceActor.canonicalLineageId,
        kind: 'FORK',
        canonical: true,
        createdAt: new Date('2026-09-13T12:00:00.000Z'),
        metadata: { sourceActorId: actorId },
      },
    });

    expect(
      await activeConsequenceReceptionsAt(
        forkActorId,
        new Date('2026-09-13T12:30:00.000Z'),
      ),
    ).toEqual([]);

    const repairEvidence = await registerEvidenceReference(
      {
        actorId,
        role: 'remediation-evidence',
        kind: 'corrective-action-completion',
        issuer: `auditor:${suffix}`,
        externalId: `repair-${suffix}`,
        digest: `sha256:${'7'.repeat(64)}`,
        observedAt: new Date('2026-09-21T09:00:00.000Z'),
      },
      registry,
    );

    const restored = await transitionConsequenceReception(
      {
        receptionId: issued.reception.id,
        actorId,
        toStatus: 'satisfied',
        evidenceArtifactId: repairEvidence.artifact.id,
        decidedByType: 'organization',
        decidedByRef: `risk-board:${suffix}`,
        occurredAt: new Date('2026-09-21T10:00:00.000Z'),
        reason: 'independent remediation evidence accepted',
        idempotencyKey: `crx-restore-${suffix}`,
      },
      registry,
    );
    expect(restored.reception.status).toBe('SATISFIED');

    const afterRestoration = await activeAuthorityConstraintsAt(
      actorId,
      new Date('2026-09-21T10:01:00.000Z'),
      { action: 'purchase', resource: 'checkout' },
    );
    expect(afterRestoration).toEqual([]);

    await expect(
      db.consequenceReception.update({
        where: { id: issued.reception.id },
        data: { metadata: { rewritten: true } },
      }),
    ).rejects.toThrow();

    const verification = await verifyConsequenceReceptionState(actorId);
    expect(verification.valid).toBe(true);
    expect(verification.issues).toEqual([]);
    expect(verification.receptionCount).toBe(1);
    expect(verification.activeCount).toBe(0);
  });
});
