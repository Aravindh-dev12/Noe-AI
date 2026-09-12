import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  createDependencyRelation,
  createDependencySnapshot,
  db,
  dependencyComponentIdentityDigest,
  getActorDependencyState,
  getDependencyExposure,
  recordDependencyIncident,
  registerDependencyComponent,
  verifyActorDependencyState,
} from './index.js';

const suffix = randomUUID();
const actorId = `act_dependency_${suffix}`;
const lineageId = `lin_dependency_${suffix}`;
const executionAId = `exec_dependency_a_${suffix}`;
const executionBId = `exec_dependency_b_${suffix}`;
const evidenceId = `evidence_dependency_${suffix}`;
const componentIds: string[] = [];
const relationIds: string[] = [];
const snapshotIds: string[] = [];
const incidentIds: string[] = [];

const t0 = new Date('2026-01-01T00:00:00.000Z');
const t1 = new Date('2026-01-01T01:00:00.000Z');
const t2 = new Date('2026-01-01T02:00:00.000Z');
const t3 = new Date('2026-01-01T03:00:00.000Z');
const t4 = new Date('2026-01-01T04:00:00.000Z');

afterAll(async () => {
  if (incidentIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyIncident" WHERE "id" IN (${Prisma.join(incidentIds)})
    `);
  }
  if (relationIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyRelation" WHERE "id" IN (${Prisma.join(relationIds)})
    `);
  }
  if (snapshotIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "SnapshotDependency" WHERE "snapshotId" IN (${Prisma.join(snapshotIds)})
    `);
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ExecutionDependencySnapshot" WHERE "id" IN (${Prisma.join(snapshotIds)})
    `);
  }
  if (componentIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyComponent" WHERE "id" IN (${Prisma.join(componentIds)})
    `);
  }
  await db.evidenceArtifact.deleteMany({ where: { id: evidenceId } });
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.$disconnect();
});

describe('temporal dependency exposure', () => {
  it('builds a cycle-safe historical blast radius without rewriting exposure after migration', async () => {
    await db.actor.create({
      data: {
        id: actorId,
        handle: `dependency-${suffix}`.slice(0, 32),
        displayName: 'Dependency Research Actor',
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
    await db.actorExecution.createMany({
      data: [
        {
          id: executionAId,
          actorId,
          provider: 'provider-a',
          model: 'model-a',
          runtime: 'runtime-a',
          configHash: `sha256:${'a'.repeat(64)}`,
          startedAt: t0,
          endedAt: t2,
        },
        {
          id: executionBId,
          actorId,
          provider: 'provider-b',
          model: 'model-b',
          runtime: 'runtime-b',
          configHash: `sha256:${'b'.repeat(64)}`,
          startedAt: t2,
        },
      ],
    });
    await db.evidenceArtifact.create({
      data: {
        id: evidenceId,
        kind: 'incident-report',
        issuer: `test:${suffix}`,
        digest: `sha256:${'c'.repeat(64)}`,
        observedAt: t1,
      },
    });

    const providerA = await registerDependencyComponent({
      kind: 'model-provider',
      canonicalName: 'Provider A',
      externalFramework: 'spdx',
      externalReference: `provider-a-${suffix}`,
    });
    const modelA = await registerDependencyComponent({
      kind: 'model',
      canonicalName: 'Model A',
      provider: 'Provider A',
      version: '1',
      purl: `pkg:generic/model-a@1?test=${suffix}`,
    });
    const modelB = await registerDependencyComponent({
      kind: 'model',
      canonicalName: 'Model B',
      provider: 'Provider B',
      version: '1',
      purl: `pkg:generic/model-b@1?test=${suffix}`,
    });
    componentIds.push(providerA.component.id, modelA.component.id, modelB.component.id);

    const replay = await registerDependencyComponent({
      kind: 'MODEL',
      canonicalName: 'Model A',
      provider: 'Provider A',
      version: '1',
      purl: `pkg:generic/model-a@1?test=${suffix}`,
      metadata: { ignoredForIdentity: true },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.component.id).toBe(modelA.component.id);

    const relation = await createDependencyRelation({
      sourceComponentId: modelA.component.id,
      targetComponentId: providerA.component.id,
      relationType: 'served-by',
      effectiveFrom: t0,
      idempotencyKey: `dep-relation-${suffix}`,
    });
    relationIds.push(relation.relation.id);

    // Add a reverse cycle. Traversal must terminate because paths are cycle checked.
    const cycle = await createDependencyRelation({
      sourceComponentId: providerA.component.id,
      targetComponentId: modelA.component.id,
      relationType: 'test-cycle',
      effectiveFrom: t0,
      idempotencyKey: `dep-cycle-${suffix}`,
    });
    relationIds.push(cycle.relation.id);

    const snapshotA = await createDependencySnapshot({
      actorId,
      executionId: executionAId,
      framework: 'cyclonedx',
      manifestDigest: `sha256:${'d'.repeat(64)}`,
      effectiveAt: t1,
      idempotencyKey: `dep-snapshot-a-${suffix}`,
      dependencies: [
        {
          componentId: modelA.component.id,
          role: 'primary-model',
          direct: true,
          required: true,
          disclosureClass: 'aggregate',
        },
      ],
    });
    snapshotIds.push(snapshotA.snapshot.id);

    const snapshotB = await createDependencySnapshot({
      actorId,
      executionId: executionBId,
      framework: 'otel',
      manifestDigest: `sha256:${'e'.repeat(64)}`,
      effectiveAt: t3,
      idempotencyKey: `dep-snapshot-b-${suffix}`,
      dependencies: [
        {
          componentId: modelB.component.id,
          role: 'primary-model',
          direct: true,
          required: true,
          disclosureClass: 'aggregate',
        },
      ],
    });
    snapshotIds.push(snapshotB.snapshot.id);

    const historical = await getDependencyExposure(providerA.component.id, new Date(t1.getTime() + 1), 8);
    expect(historical.impactedActorCount).toBe(1);
    expect(historical.paths.some((path) => path.actorId === actorId && path.depth === 1)).toBe(true);

    const afterMigration = await getDependencyExposure(providerA.component.id, t4, 8);
    expect(afterMigration.impactedActorCount).toBe(0);

    const stateBeforeMigration = await getActorDependencyState(actorId, new Date(t1.getTime() + 1));
    expect(stateBeforeMigration.execution?.id).toBe(executionAId);
    expect(stateBeforeMigration.dependencies.map((item) => item.componentId)).toContain(modelA.component.id);

    const stateAfterMigration = await getActorDependencyState(actorId, t4);
    expect(stateAfterMigration.execution?.id).toBe(executionBId);
    expect(stateAfterMigration.dependencies.map((item) => item.componentId)).toContain(modelB.component.id);

    const incident = await recordDependencyIncident({
      componentId: providerA.component.id,
      kind: 'outage',
      sourceEvidenceArtifactId: evidenceId,
      startedAt: t1,
      endedAt: t2,
      externalFramework: 'test',
      externalReference: `incident-${suffix}`,
      idempotencyKey: `dep-incident-${suffix}`,
    });
    incidentIds.push(incident.incident.id);

    const verification = await verifyActorDependencyState(actorId);
    expect(verification.valid).toBe(true);
    expect(verification.snapshotCount).toBe(2);
  });

  it('uses stable component identity independent of metadata ordering', () => {
    const left = dependencyComponentIdentityDigest({
      kind: 'model',
      canonicalName: 'Example',
      provider: 'Provider',
      version: '1',
      metadata: { a: 1, b: 2 },
    });
    const right = dependencyComponentIdentityDigest({
      kind: 'MODEL',
      canonicalName: 'Example',
      provider: 'Provider',
      version: '1',
      metadata: { b: 99 },
    });
    expect(left).toBe(right);
  });
});
