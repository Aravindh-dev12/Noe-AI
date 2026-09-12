import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  ControlContinuityConflictError,
  assertActorControlOperationalAt,
  createActorControlPolicy,
  db,
  finalizeActorControlTransition,
  getActorControlSummaryByHandle,
  initializeActorControlEpoch,
  proposeActorControlTransition,
  recordActorControlApproval,
  verifyActorControlHistory,
} from './index.js';

const suffix = randomUUID();
const actorId = `act_control_${suffix}`;
const executionId = `exec_control_${suffix}`;
const lineageId = `lin_control_${suffix}`;
const handle = `control-${suffix}`.slice(0, 32);

const t0 = new Date('2026-03-01T00:00:00.000Z');
const t1 = new Date('2026-03-01T01:00:00.000Z');
const t2 = new Date('2026-03-01T02:00:00.000Z');
const t3 = new Date('2026-03-01T03:00:00.000Z');
const t4 = new Date('2026-03-01T04:00:00.000Z');

const evidenceIds = {
  policy: `evidence_control_policy_${suffix}`,
  initial: `evidence_control_initial_${suffix}`,
  rotation: `evidence_control_rotation_${suffix}`,
  guardian1: `evidence_control_guardian1_${suffix}`,
  guardian2: `evidence_control_guardian2_${suffix}`,
  guardian3: `evidence_control_guardian3_${suffix}`,
  quarantine: `evidence_control_quarantine_${suffix}`,
  restore: `evidence_control_restore_${suffix}`,
  objection: `evidence_control_objection_${suffix}`,
};

const registry = {
  signingSecret: 'control-continuity-integration-secret-that-is-long-enough',
  hostId: 'host_noeone',
  environmentVersion: 'noeone-control@test',
  issuer: 'noeone-test',
};

async function ensureHost() {
  await db.host.upsert({
    where: { id: registry.hostId },
    update: { status: 'active' },
    create: {
      id: registry.hostId,
      slug: `noeone-control-test-${suffix}`,
      displayName: 'NOEONE control test host',
      status: 'active',
    },
  });
}

async function createResearchActor() {
  await db.actor.create({
    data: {
      id: actorId,
      handle,
      displayName: 'Control Continuity Test Actor',
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: t0,
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: t0,
    },
  });
  await db.actorExecution.create({
    data: {
      id: executionId,
      actorId,
      provider: 'test-provider',
      model: 'test-model',
      runtime: 'test-runtime',
      configHash: `sha256:${'a'.repeat(64)}`,
      startedAt: t0,
    },
  });
}

async function createEvidence() {
  const entries = Object.entries(evidenceIds);
  await db.evidenceArtifact.createMany({
    data: entries.map(([name, id], index) => ({
      id,
      kind: `control-${name}`,
      issuer: `control-test:${name}:${suffix}`,
      digest: `sha256:${String(index + 1).padStart(64, '0')}`,
      observedAt: new Date(t0.getTime() + index * 1000),
    })),
  });
}

async function approve(
  transitionId: string,
  guardian: 'alice' | 'bob' | 'carol',
  evidenceArtifactId: string,
  observedAt: Date,
  key: string,
  disposition: 'APPROVE' | 'OBJECT' = 'APPROVE',
) {
  return recordActorControlApproval({
    transitionId,
    principalType: 'user',
    principalRef: guardian,
    disposition,
    sourceEvidenceArtifactId: evidenceArtifactId,
    observedAt,
    idempotencyKey: `${key}-${suffix}`,
  });
}

afterAll(async () => {
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "ActorControlApproval"
    WHERE "transitionId" IN (
      SELECT "id" FROM "ActorControlTransition" WHERE "actorId" = ${actorId}
    )
  `);
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "ActorControlTransition" WHERE "actorId" = ${actorId}
  `);
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "ActorControlEpoch" WHERE "actorId" = ${actorId}
  `);
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "ActorControlGuardian"
    WHERE "policyId" IN (
      SELECT "id" FROM "ActorControlPolicy" WHERE "actorId" = ${actorId}
    )
  `);
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "ActorControlPolicy" WHERE "actorId" = ${actorId}
  `);
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.evidenceArtifact.deleteMany({ where: { id: { in: Object.values(evidenceIds) } } });
  await db.$disconnect();
});

describe('actor control continuity', () => {
  it('keeps one actor through rotation, quarantine, recovery, and a rejected takeover', async () => {
    await ensureHost();
    await createResearchActor();
    await createEvidence();

    const policyResult = await createActorControlPolicy(
      {
        actorId,
        threshold: 2,
        challengeWindowSeconds: 3600,
        guardians: [
          { principalType: 'user', principalRef: 'alice' },
          { principalType: 'user', principalRef: 'bob' },
          { principalType: 'user', principalRef: 'carol' },
        ],
        sourceEvidenceArtifactId: evidenceIds.policy,
        externalFramework: 'keri',
        externalReference: `keri:test:${suffix}`,
        effectiveAt: t0,
        idempotencyKey: `control-policy-${suffix}`,
      },
      registry,
    );
    expect(policyResult.replayed).toBe(false);
    expect(policyResult.policy.threshold).toBe(2);
    expect(policyResult.guardians).toHaveLength(3);

    const initial = await initializeActorControlEpoch(
      {
        actorId,
        policyId: policyResult.policy.id,
        controllerType: 'user',
        controllerRef: 'owner-primary',
        keyStateDigest: `sha256:${'1'.repeat(64)}`,
        sourceEvidenceArtifactId: evidenceIds.initial,
        externalFramework: 'keri',
        externalReference: `keri:test:${suffix}:0`,
        startedAt: t0,
        idempotencyKey: `control-epoch-initial-${suffix}`,
      },
      registry,
    );
    expect(initial.epoch.epoch).toBe(1);
    expect(initial.epoch.state).toBe('ACTIVE');

    const rotation = await proposeActorControlTransition({
      actorId,
      kind: 'ROTATION',
      sourceEvidenceArtifactId: evidenceIds.rotation,
      proposedControllerType: 'user',
      proposedControllerRef: 'owner-primary',
      proposedKeyStateDigest: `sha256:${'2'.repeat(64)}`,
      proposedAt: t1,
      idempotencyKey: `control-rotation-${suffix}`,
    });
    expect(rotation.transition.challengeUntil.toISOString()).toBe(t2.toISOString());

    await approve(
      rotation.transition.id,
      'alice',
      evidenceIds.guardian1,
      new Date(t1.getTime() + 5_000),
      'rotation-alice',
    );
    await expect(
      finalizeActorControlTransition(rotation.transition.id, registry, t2),
    ).rejects.toBeInstanceOf(ControlContinuityConflictError);

    await approve(
      rotation.transition.id,
      'bob',
      evidenceIds.guardian2,
      new Date(t1.getTime() + 10_000),
      'rotation-bob',
    );
    await expect(
      finalizeActorControlTransition(
        rotation.transition.id,
        registry,
        new Date(t1.getTime() + 3_599_000),
      ),
    ).rejects.toBeInstanceOf(ControlContinuityConflictError);

    const rotated = await finalizeActorControlTransition(rotation.transition.id, registry, t2);
    expect(rotated.accepted).toBe(true);
    expect(rotated.epoch?.epoch).toBe(2);
    expect(rotated.epoch?.actorId).toBe(actorId);
    expect(rotated.epoch?.controllerRef).toBe('owner-primary');
    expect(rotated.epoch?.keyStateDigest).toBe(`sha256:${'2'.repeat(64)}`);

    const quarantine = await proposeActorControlTransition({
      actorId,
      kind: 'QUARANTINE',
      sourceEvidenceArtifactId: evidenceIds.quarantine,
      proposedAt: t2,
      idempotencyKey: `control-quarantine-${suffix}`,
    });
    expect(quarantine.transition.challengeUntil.toISOString()).toBe(t2.toISOString());

    await approve(
      quarantine.transition.id,
      'alice',
      evidenceIds.guardian1,
      new Date(t2.getTime() + 1_000),
      'quarantine-alice',
    );
    await approve(
      quarantine.transition.id,
      'carol',
      evidenceIds.guardian3,
      new Date(t2.getTime() + 2_000),
      'quarantine-carol',
    );
    const quarantineAt = new Date(t2.getTime() + 3_000);
    const quarantined = await finalizeActorControlTransition(
      quarantine.transition.id,
      registry,
      quarantineAt,
    );
    expect(quarantined.accepted).toBe(true);
    expect(quarantined.epoch?.epoch).toBe(3);
    expect(quarantined.epoch?.state).toBe('QUARANTINED');
    expect(quarantined.epoch?.actorId).toBe(actorId);

    await expect(
      db.$transaction((tx) =>
        assertActorControlOperationalAt(tx, actorId, new Date(quarantineAt.getTime() + 1)),
      ),
    ).rejects.toMatchObject({ statusCode: 423, code: 'actor_control_quarantined' });

    const restore = await proposeActorControlTransition({
      actorId,
      kind: 'RESTORE',
      sourceEvidenceArtifactId: evidenceIds.restore,
      proposedControllerType: 'user',
      proposedControllerRef: 'owner-recovered',
      proposedKeyStateDigest: `sha256:${'3'.repeat(64)}`,
      proposedAt: t3,
      idempotencyKey: `control-restore-${suffix}`,
    });
    await approve(
      restore.transition.id,
      'bob',
      evidenceIds.guardian2,
      new Date(t3.getTime() + 1_000),
      'restore-bob',
    );
    await approve(
      restore.transition.id,
      'carol',
      evidenceIds.guardian3,
      new Date(t3.getTime() + 2_000),
      'restore-carol',
    );
    const restored = await finalizeActorControlTransition(restore.transition.id, registry, t4);
    expect(restored.accepted).toBe(true);
    expect(restored.epoch?.epoch).toBe(4);
    expect(restored.epoch?.state).toBe('ACTIVE');
    expect(restored.epoch?.controllerRef).toBe('owner-recovered');
    expect(restored.epoch?.actorId).toBe(actorId);

    const operational = await db.$transaction((tx) =>
      assertActorControlOperationalAt(tx, actorId, new Date(t4.getTime() + 1)),
    );
    expect(operational.operational).toBe(true);
    expect(operational.epoch).toBe(4);

    const hostile = await proposeActorControlTransition({
      actorId,
      kind: 'TRANSFER',
      sourceEvidenceArtifactId: evidenceIds.objection,
      proposedControllerType: 'external',
      proposedControllerRef: 'untrusted-claimant',
      proposedAt: new Date(t4.getTime() + 1_000),
      idempotencyKey: `control-hostile-${suffix}`,
    });
    await approve(
      hostile.transition.id,
      'alice',
      evidenceIds.guardian1,
      new Date(t4.getTime() + 2_000),
      'hostile-alice',
      'OBJECT',
    );
    await approve(
      hostile.transition.id,
      'bob',
      evidenceIds.guardian2,
      new Date(t4.getTime() + 3_000),
      'hostile-bob',
    );
    const rejected = await finalizeActorControlTransition(
      hostile.transition.id,
      registry,
      new Date(t4.getTime() + 3_601_000),
    );
    expect(rejected.accepted).toBe(false);
    expect(rejected.transition.status).toBe('REJECTED');

    const actor = await db.actor.findUniqueOrThrow({ where: { id: actorId } });
    expect(actor.id).toBe(actorId);
    expect(actor.canonicalLineageId).toBe(lineageId);

    const summary = await getActorControlSummaryByHandle(handle);
    expect(summary.configured).toBe(true);
    expect(summary.control?.epoch).toBe(4);
    expect(summary.control?.state).toBe('active');
    expect(summary.control?.controllerType).toBe('user');
    expect(summary.history.recoveries).toBe(0);
    expect(summary.history.quarantines).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('owner-recovered');
    expect(JSON.stringify(summary)).not.toContain('alice');
    expect(JSON.stringify(summary)).not.toContain('bob');
    expect(JSON.stringify(summary)).not.toContain('carol');

    const verification = await verifyActorControlHistory(actorId);
    expect(verification.valid).toBe(true);
    expect(verification.issues).toEqual([]);
    expect(verification.currentEpoch).toBe(4);
    expect(verification.currentState).toBe('active');

    const actorEvents = await db.actorEvent.findMany({
      where: { actorId, type: { startsWith: 'actor.control.' } },
      orderBy: { sequence: 'asc' },
    });
    expect(actorEvents.map((event) => event.type)).toEqual([
      'actor.control.policy.changed',
      'actor.control.epoch.started',
      'actor.control.rotation.accepted',
      'actor.control.quarantine.accepted',
      'actor.control.restore.accepted',
    ]);
    expect(JSON.stringify(actorEvents)).not.toContain('owner-recovered');
    expect(JSON.stringify(actorEvents)).not.toContain('untrusted-claimant');
  });
});
