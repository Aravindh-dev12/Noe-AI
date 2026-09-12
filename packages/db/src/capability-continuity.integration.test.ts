import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  db,
  getActorCapabilityContinuitySummary,
  getAuthorityAdmissibilityState,
  recordAuthorityAdmissibilityAssessment,
  registerExecutionCapabilityManifest,
  verifyCapabilityContinuity,
} from './index.js';

const suffix = randomUUID();
const actorId = `act_capability_${suffix}`;
const lineageId = `lin_capability_${suffix}`;
const exec1 = `exec_capability_weak_${suffix}`;
const exec2 = `exec_capability_strong_${suffix}`;
const grantId = `grant_capability_${suffix}`;
const ids = { manifests: [] as string[], assessments: [] as string[] };

const t0 = new Date('2026-09-01T00:00:00.000Z');
const t1 = new Date('2026-09-02T00:00:00.000Z');
const t2 = new Date('2026-09-02T01:00:00.000Z');

afterAll(async () => {
  if (ids.assessments.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "AuthorityAdmissibilityAssessment"
      WHERE "id" IN (${Prisma.join(ids.assessments)})
    `);
  }
  if (ids.manifests.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ExecutionCapabilityManifest"
      WHERE "id" IN (${Prisma.join(ids.manifests)})
    `);
  }
  await db.authorityGrant.deleteMany({ where: { id: grantId } });
  await db.actorExecution.deleteMany({ where: { actorId } });
  await db.lineageNode.deleteMany({ where: { actorId } });
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.$disconnect();
});

describe('execution capability continuity', () => {
  it('preserves actor/grant identity while requiring fresh admissibility after migration', async () => {
    await db.actor.create({
      data: {
        id: actorId,
        handle: `capability-${suffix}`.slice(0, 32),
        displayName: 'Capability Continuity Actor',
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
        id: exec1,
        actorId,
        provider: 'weak-provider',
        model: 'weak-model-v1',
        runtime: 'mail-only-runtime',
        configHash: `sha256:${'1'.repeat(64)}`,
        startedAt: t0,
      },
    });
    await db.authorityGrant.create({
      data: {
        id: grantId,
        subjectActorId: actorId,
        grantorType: 'system',
        grantorRef: 'capability-continuity-test',
        status: 'ACTIVE',
        actions: ['send-email'],
        resources: ['mailbox:*'],
        canRedelegate: false,
        remainingDelegationDepth: 0,
        notBefore: t0,
        issuedByType: 'system',
        idempotencyKey: `grant-capability-${suffix}`,
      },
    });

    const firstManifest = await registerExecutionCapabilityManifest({
      actorId,
      executionId: exec1,
      framework: 'acpm',
      frameworkVersion: 'draft-00',
      issuer: 'lab:test',
      capabilities: ['communication.email.send'],
      tools: ['email.send'],
      modelRef: 'weak-model-v1',
      runtimeRef: 'mail-only-runtime',
      effectiveAt: t0,
      idempotencyKey: `manifest-weak-${suffix}`,
    });
    ids.manifests.push(firstManifest.manifest.id);

    const firstAssessment = await recordAuthorityAdmissibilityAssessment({
      grantId,
      executionId: exec1,
      capabilityManifestId: firstManifest.manifest.id,
      disposition: 'ADMISSIBLE',
      evaluator: 'policy:test',
      method: 'execution-review',
      methodVersion: '1',
      assessedAt: new Date('2026-09-01T01:00:00.000Z'),
      reasons: ['mail-only execution is within reviewed boundary'],
      idempotencyKey: `assessment-weak-${suffix}`,
    });
    ids.assessments.push(firstAssessment.assessment.id);

    const oldState = await getAuthorityAdmissibilityState(
      grantId,
      exec1,
      new Date('2026-09-01T02:00:00.000Z'),
    );
    expect(oldState.state).toBe('ASSESSED');
    expect(oldState.dispositionCounts).toEqual({ ADMISSIBLE: 1 });

    await db.actorExecution.update({ where: { id: exec1 }, data: { endedAt: t1 } });
    await db.actorExecution.create({
      data: {
        id: exec2,
        actorId,
        provider: 'frontier-provider',
        model: 'frontier-model-v9',
        runtime: 'browser-shell-runtime',
        configHash: `sha256:${'2'.repeat(64)}`,
        startedAt: t1,
      },
    });

    const missingEvidence = await getAuthorityAdmissibilityState(grantId, exec2, t2);
    expect(missingEvidence.state).toBe('EVIDENCE_MISSING');
    expect(missingEvidence.assessmentCount).toBe(0);

    const secondManifest = await registerExecutionCapabilityManifest({
      actorId,
      executionId: exec2,
      framework: 'acpm',
      frameworkVersion: 'draft-00',
      issuer: 'lab:test',
      capabilities: [
        'communication.email.send',
        'network.browser.navigate',
        'system.shell.execute',
        'agents.delegate',
      ],
      tools: ['email.send', 'browser', 'shell', 'a2a.delegate'],
      modelRef: 'frontier-model-v9',
      runtimeRef: 'browser-shell-runtime',
      effectiveAt: t1,
      idempotencyKey: `manifest-strong-${suffix}`,
    });
    ids.manifests.push(secondManifest.manifest.id);

    const needsReview = await getAuthorityAdmissibilityState(grantId, exec2, t2);
    expect(needsReview.state).toBe('REVIEW_REQUIRED');
    expect(needsReview.capabilityManifestCount).toBe(1);

    const approve = await recordAuthorityAdmissibilityAssessment({
      grantId,
      executionId: exec2,
      capabilityManifestId: secondManifest.manifest.id,
      disposition: 'ADMISSIBLE',
      evaluator: 'policy-team-a',
      method: 'migration-review',
      methodVersion: '2',
      assessedAt: t2,
      reasons: ['scope remains narrow and enforcement is external'],
      idempotencyKey: `assessment-strong-a-${suffix}`,
    });
    const suspend = await recordAuthorityAdmissibilityAssessment({
      grantId,
      executionId: exec2,
      capabilityManifestId: secondManifest.manifest.id,
      disposition: 'SUSPENDED',
      evaluator: 'risk-team-b',
      method: 'capability-expansion-review',
      methodVersion: '1',
      assessedAt: t2,
      reasons: ['shell and delegation capabilities materially expand blast radius'],
      idempotencyKey: `assessment-strong-b-${suffix}`,
    });
    ids.assessments.push(approve.assessment.id, suspend.assessment.id);

    const assessed = await getAuthorityAdmissibilityState(
      grantId,
      exec2,
      new Date('2026-09-02T02:00:00.000Z'),
    );
    expect(assessed.state).toBe('ASSESSED');
    expect(assessed.disagreement).toBe(true);
    expect(assessed.dispositionCounts).toEqual({ ADMISSIBLE: 1, SUSPENDED: 1 });

    const summary = await getActorCapabilityContinuitySummary(
      actorId,
      new Date('2026-09-02T02:00:00.000Z'),
    );
    expect(summary.executionId).toBe(exec2);
    expect(summary.activeGrantCount).toBe(1);
    expect(summary.assessedGrantCount).toBe(1);

    // Later revocation changes today's authority state but must not corrupt the
    // immutable historical admissibility basis captured for either execution.
    // Revocation is a complete projection: who revoked the grant and why is
    // part of the canonical authority history, not optional bookkeeping.
    await db.authorityGrant.update({
      where: { id: grantId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date('2026-09-03T00:00:00.000Z'),
        revokedByType: 'system',
        revokedById: 'capability-continuity-test',
        revocationReason: 'execution capability expansion requires a new authority grant',
      },
    });

    const verification = await verifyCapabilityContinuity(actorId);
    expect(verification.verified).toBe(true);
    expect(verification.manifestCount).toBe(2);
    expect(verification.assessmentCount).toBe(3);

    const historical = await getAuthorityAdmissibilityState(
      grantId,
      exec1,
      new Date('2026-09-01T02:00:00.000Z'),
    );
    expect(historical.state).toBe('ASSESSED');
    expect(historical.dispositionCounts).toEqual({ ADMISSIBLE: 1 });
  });
});
