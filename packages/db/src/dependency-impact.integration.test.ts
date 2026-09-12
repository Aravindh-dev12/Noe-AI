import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  DependencyImpactConflictError,
  createDependencyRelation,
  createDependencySnapshot,
  db,
  getDependencyIncidentTriage,
  recordDependencyImpactAssessment,
  recordDependencyIncident,
  registerDependencyComponent,
  verifyDependencyImpactAssessment,
} from './index.js';

const suffix = randomUUID();
const actorId = `act_impact_${suffix}`;
const executionId = `exec_impact_${suffix}`;
const lineageId = `lin_impact_${suffix}`;
const unrelatedActorId = `act_impact_unrelated_${suffix}`;
const unrelatedExecutionId = `exec_impact_unrelated_${suffix}`;
const unrelatedLineageId = `lin_impact_unrelated_${suffix}`;
const incidentEvidenceId = `evidence_impact_incident_${suffix}`;
const providerEvidenceId = `evidence_impact_provider_${suffix}`;
const labEvidenceId = `evidence_impact_lab_${suffix}`;
const ids = {
  components: [] as string[],
  relations: [] as string[],
  snapshots: [] as string[],
  incidents: [] as string[],
  assessments: [] as string[],
};

const t0 = new Date('2026-02-01T00:00:00.000Z');
const t1 = new Date('2026-02-01T01:00:00.000Z');
const t2 = new Date('2026-02-01T02:00:00.000Z');

async function createActor(
  id: string,
  execution: string,
  lineage: string,
  handlePrefix: string,
) {
  await db.actor.create({
    data: {
      id,
      handle: `${handlePrefix}-${suffix}`.slice(0, 32),
      displayName: `Impact actor ${handlePrefix}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineage,
      createdAt: t0,
    },
  });
  await db.lineageNode.create({
    data: { id: lineage, actorId: id, kind: 'ORIGIN', canonical: true, createdAt: t0 },
  });
  await db.actorExecution.create({
    data: {
      id: execution,
      actorId: id,
      provider: 'test-provider',
      model: 'test-model',
      runtime: 'test-runtime',
      configHash: `sha256:${'a'.repeat(64)}`,
      startedAt: t0,
    },
  });
}

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
    where: { id: { in: [incidentEvidenceId, providerEvidenceId, labEvidenceId] } },
  });
  await db.actor.deleteMany({ where: { id: { in: [actorId, unrelatedActorId] } } });
  await db.$disconnect();
});

describe('dependency impact applicability', () => {
  it('preserves conflicting assessments and verifies their historical path basis', async () => {
    await createActor(actorId, executionId, lineageId, 'impact');
    await createActor(unrelatedActorId, unrelatedExecutionId, unrelatedLineageId, 'unrelated');

    await db.evidenceArtifact.createMany({
      data: [
        {
          id: incidentEvidenceId,
          kind: 'incident-report',
          issuer: `provider:${suffix}`,
          digest: `sha256:${'b'.repeat(64)}`,
          observedAt: t1,
        },
        {
          id: providerEvidenceId,
          kind: 'impact-assessment',
          issuer: `provider:${suffix}`,
          digest: `sha256:${'c'.repeat(64)}`,
          observedAt: t1,
        },
        {
          id: labEvidenceId,
          kind: 'impact-assessment',
          issuer: `lab:${suffix}`,
          digest: `sha256:${'d'.repeat(64)}`,
          observedAt: t2,
        },
      ],
    });

    const provider = await registerDependencyComponent({
      kind: 'model-provider',
      canonicalName: `Provider ${suffix}`,
    });
    const model = await registerDependencyComponent({
      kind: 'model',
      canonicalName: `Model ${suffix}`,
      provider: `Provider ${suffix}`,
      version: '1',
    });
    const runtime = await registerDependencyComponent({
      kind: 'runtime',
      canonicalName: `Runtime ${suffix}`,
      version: '1',
    });
    ids.components.push(provider.component.id, model.component.id, runtime.component.id);

    const relation = await createDependencyRelation({
      sourceComponentId: model.component.id,
      targetComponentId: provider.component.id,
      relationType: 'served-by',
      effectiveFrom: t0,
      idempotencyKey: `impact-relation-${suffix}`,
    });
    ids.relations.push(relation.relation.id);

    const snapshot = await createDependencySnapshot({
      actorId,
      executionId,
      framework: 'cyclonedx',
      manifestDigest: `sha256:${'e'.repeat(64)}`,
      effectiveAt: t0,
      idempotencyKey: `impact-snapshot-${suffix}`,
      dependencies: [
        {
          componentId: model.component.id,
          role: 'primary-model',
          direct: true,
          required: true,
          disclosureClass: 'private',
        },
      ],
    });
    ids.snapshots.push(snapshot.snapshot.id);

    const incident = await recordDependencyIncident({
      componentId: provider.component.id,
      kind: 'model-regression',
      sourceEvidenceArtifactId: incidentEvidenceId,
      startedAt: t1,
      idempotencyKey: `impact-incident-${suffix}`,
    });
    ids.incidents.push(incident.incident.id);

    const providerAssessment = await recordDependencyImpactAssessment({
      incidentId: incident.incident.id,
      actorId,
      executionId,
      disposition: 'NOT_AFFECTED',
      evaluator: `provider:${suffix}`,
      method: 'internal-eval',
      methodVersion: '1',
      sourceEvidenceArtifactId: providerEvidenceId,
      exposureAt: t1,
      confidenceBps: 9000,
      idempotencyKey: `impact-assessment-provider-${suffix}`,
    });
    ids.assessments.push(providerAssessment.assessment.id);

    const replay = await recordDependencyImpactAssessment({
      incidentId: incident.incident.id,
      actorId,
      executionId,
      disposition: 'NOT_AFFECTED',
      evaluator: `provider:${suffix}`,
      method: 'internal-eval',
      methodVersion: '1',
      sourceEvidenceArtifactId: providerEvidenceId,
      exposureAt: t1,
      confidenceBps: 9000,
      idempotencyKey: `impact-assessment-provider-${suffix}`,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.assessment.id).toBe(providerAssessment.assessment.id);

    const labAssessment = await recordDependencyImpactAssessment({
      incidentId: incident.incident.id,
      actorId,
      executionId,
      disposition: 'AFFECTED',
      evaluator: `independent-lab:${suffix}`,
      method: 'reproduction-suite',
      methodVersion: '2',
      sourceEvidenceArtifactId: labEvidenceId,
      exposureAt: t1,
      confidenceBps: 7600,
      idempotencyKey: `impact-assessment-lab-${suffix}`,
    });
    ids.assessments.push(labAssessment.assessment.id);

    await expect(
      recordDependencyImpactAssessment({
        incidentId: incident.incident.id,
        actorId: unrelatedActorId,
        executionId: unrelatedExecutionId,
        disposition: 'UNDER_INVESTIGATION',
        evaluator: `lab:${suffix}`,
        method: 'triage',
        methodVersion: '1',
        sourceEvidenceArtifactId: labEvidenceId,
        exposureAt: t1,
        idempotencyKey: `impact-assessment-unrelated-${suffix}`,
      }),
    ).rejects.toBeInstanceOf(DependencyImpactConflictError);

    const beforeLateDiscovery = await verifyDependencyImpactAssessment(providerAssessment.assessment.id);
    expect(beforeLateDiscovery.valid).toBe(true);

    // Discover a previously unknown historical path after the original assessment.
    // The old assessment must remain verifiable from its captured basis rather than
    // being rewritten to whatever the registry knows today.
    const lateRelation = await createDependencyRelation({
      sourceComponentId: runtime.component.id,
      targetComponentId: provider.component.id,
      relationType: 'historically-hosted-by',
      effectiveFrom: t0,
      idempotencyKey: `impact-late-relation-${suffix}`,
    });
    ids.relations.push(lateRelation.relation.id);

    const afterLateDiscovery = await verifyDependencyImpactAssessment(providerAssessment.assessment.id);
    expect(afterLateDiscovery.valid).toBe(true);
    expect(afterLateDiscovery.pathDigest).toBe(beforeLateDiscovery.pathDigest);

    const triage = await getDependencyIncidentTriage(incident.incident.id, t1, 8);
    expect(triage.exposure.impactedActorCount).toBe(1);
    expect(triage.assessments).toHaveLength(2);
    expect(triage.universalVerdict).toBeNull();
    expect(
      triage.assessmentSummary.find(
        (entry) => entry.actorId === actorId && entry.executionId === executionId,
      )?.dispositions,
    ).toEqual(['AFFECTED', 'NOT_AFFECTED']);
  });
});
