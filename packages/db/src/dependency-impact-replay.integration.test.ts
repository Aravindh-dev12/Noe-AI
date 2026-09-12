import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  createDependencyRelation,
  createDependencySnapshot,
  db,
  getDependencyExposure,
  recordDependencyImpactAssessment,
  recordDependencyIncident,
  registerDependencyComponent,
} from './index.js';

const suffix = randomUUID();
const actorId = `act_impact_replay_${suffix}`;
const executionId = `exec_impact_replay_${suffix}`;
const lineageId = `lin_impact_replay_${suffix}`;
const incidentEvidenceId = `evidence_impact_replay_incident_${suffix}`;
const assessmentEvidenceId = `evidence_impact_replay_assessment_${suffix}`;
const ids = {
  components: [] as string[],
  relations: [] as string[],
  snapshots: [] as string[],
  incidents: [] as string[],
  assessments: [] as string[],
};

const t0 = new Date('2026-03-01T00:00:00.000Z');
const t1 = new Date('2026-03-01T01:00:00.000Z');

afterAll(async () => {
  if (ids.assessments.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyImpactAssessment" WHERE "id" IN (${Prisma.join(ids.assessments)})
    `);
  }
  if (ids.incidents.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyIncident" WHERE "id" IN (${Prisma.join(ids.incidents)})
    `);
  }
  if (ids.relations.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyRelation" WHERE "id" IN (${Prisma.join(ids.relations)})
    `);
  }
  if (ids.snapshots.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "SnapshotDependency" WHERE "snapshotId" IN (${Prisma.join(ids.snapshots)})
    `);
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ExecutionDependencySnapshot" WHERE "id" IN (${Prisma.join(ids.snapshots)})
    `);
  }
  if (ids.components.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "DependencyComponent" WHERE "id" IN (${Prisma.join(ids.components)})
    `);
  }
  await db.evidenceArtifact.deleteMany({
    where: { id: { in: [incidentEvidenceId, assessmentEvidenceId] } },
  });
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.$disconnect();
});

describe('dependency impact replay stability', () => {
  it('replays the original assessment after new historical dependency knowledge changes the path basis', async () => {
    await db.actor.create({
      data: {
        id: actorId,
        handle: `impact-replay-${suffix}`.slice(0, 32),
        displayName: 'Impact Replay Actor',
        actorType: 'RESEARCH',
        status: 'ACTIVE',
        canonicalLineageId: lineageId,
        createdAt: t0,
      },
    });
    await db.lineageNode.create({
      data: { id: lineageId, actorId, kind: 'ORIGIN', canonical: true, createdAt: t0 },
    });
    await db.actorExecution.create({
      data: {
        id: executionId,
        actorId,
        provider: 'provider-replay',
        model: 'model-replay',
        runtime: 'runtime-replay',
        configHash: `sha256:${'1'.repeat(64)}`,
        startedAt: t0,
      },
    });
    await db.evidenceArtifact.createMany({
      data: [
        {
          id: incidentEvidenceId,
          kind: 'incident-report',
          issuer: `provider-replay:${suffix}`,
          digest: `sha256:${'2'.repeat(64)}`,
          observedAt: t1,
        },
        {
          id: assessmentEvidenceId,
          kind: 'impact-assessment',
          issuer: `lab-replay:${suffix}`,
          digest: `sha256:${'3'.repeat(64)}`,
          observedAt: t1,
        },
      ],
    });

    const provider = await registerDependencyComponent({
      kind: 'model-provider',
      canonicalName: `Replay Provider ${suffix}`,
    });
    const model = await registerDependencyComponent({
      kind: 'model',
      canonicalName: `Replay Model ${suffix}`,
      provider: `Replay Provider ${suffix}`,
      version: '1',
    });
    const runtime = await registerDependencyComponent({
      kind: 'runtime',
      canonicalName: `Replay Runtime ${suffix}`,
      version: '1',
    });
    ids.components.push(provider.component.id, model.component.id, runtime.component.id);

    const primaryRelation = await createDependencyRelation({
      sourceComponentId: model.component.id,
      targetComponentId: provider.component.id,
      relationType: 'served-by',
      effectiveFrom: t0,
      idempotencyKey: `impact-replay-primary-${suffix}`,
    });
    ids.relations.push(primaryRelation.relation.id);

    const snapshot = await createDependencySnapshot({
      actorId,
      executionId,
      framework: 'cyclonedx',
      manifestDigest: `sha256:${'4'.repeat(64)}`,
      effectiveAt: t0,
      idempotencyKey: `impact-replay-snapshot-${suffix}`,
      dependencies: [
        {
          componentId: model.component.id,
          role: 'primary-model',
          direct: true,
          required: true,
        },
        {
          componentId: runtime.component.id,
          role: 'runtime',
          direct: true,
          required: true,
        },
      ],
    });
    ids.snapshots.push(snapshot.snapshot.id);

    const incident = await recordDependencyIncident({
      componentId: provider.component.id,
      kind: 'regression',
      sourceEvidenceArtifactId: incidentEvidenceId,
      startedAt: t1,
      idempotencyKey: `impact-replay-incident-${suffix}`,
    });
    ids.incidents.push(incident.incident.id);

    const idempotencyKey = `impact-replay-assessment-${suffix}`;
    const request = {
      incidentId: incident.incident.id,
      actorId,
      executionId,
      disposition: 'UNDER_INVESTIGATION' as const,
      evaluator: `lab-replay:${suffix}`,
      method: 'reproduction-suite',
      methodVersion: '1',
      sourceEvidenceArtifactId: assessmentEvidenceId,
      exposureAt: t1,
      confidenceBps: 5000,
      idempotencyKey,
    };

    const firstExposure = await getDependencyExposure(provider.component.id, t1, 8);
    const firstActorPaths = firstExposure.paths.filter(
      (path) => path.actorId === actorId && path.executionId === executionId,
    );
    expect(firstActorPaths.map((path) => path.componentId)).toEqual([model.component.id]);

    const first = await recordDependencyImpactAssessment(request);
    ids.assessments.push(first.assessment.id);
    expect(first.replayed).toBe(false);

    const discoveredLater = await createDependencyRelation({
      sourceComponentId: runtime.component.id,
      targetComponentId: provider.component.id,
      relationType: 'historically-hosted-by',
      effectiveFrom: t0,
      idempotencyKey: `impact-replay-late-${suffix}`,
    });
    ids.relations.push(discoveredLater.relation.id);

    const richerExposure = await getDependencyExposure(provider.component.id, t1, 8);
    const richerActorPaths = richerExposure.paths.filter(
      (path) => path.actorId === actorId && path.executionId === executionId,
    );
    expect(new Set(richerActorPaths.map((path) => path.componentId))).toEqual(
      new Set([model.component.id, runtime.component.id]),
    );

    const replay = await recordDependencyImpactAssessment(request);
    expect(replay.replayed).toBe(true);
    expect(replay.assessment.id).toBe(first.assessment.id);
    expect(replay.assessment.pathDigest).toBe(first.assessment.pathDigest);
    expect(replay.assessment.basisDigest).toBe(first.assessment.basisDigest);
  });
});
