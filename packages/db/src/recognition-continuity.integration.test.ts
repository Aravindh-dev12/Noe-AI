import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  acceptContinuityTransition,
  db,
  getActorRecognitionSummary,
  proposeMigration,
  recordContinuityRecognitionAssessment,
  verifyRecognitionContinuity,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_recognition_${suffix}`;
const actorIds: string[] = [];
const ancestryIds: string[] = [];

const registry = {
  signingSecret: 'test-recognition-signing-secret-that-is-long-enough',
  hostId,
  environmentVersion: 'noeone-recognition@test',
  issuer: 'noeone-test',
} as const;

async function createActor(label: string) {
  const actorId = `act_rec_${label}_${randomUUID()}`;
  const executionId = `exec_rec_${label}_${randomUUID()}`;
  const lineageId = `lin_rec_${label}_${randomUUID()}`;
  const now = new Date();

  await db.actor.create({
    data: {
      id: actorId,
      handle: `rec-${label}-${randomUUID()}`.slice(0, 32),
      displayName: `Recognition ${label}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: now,
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
      startedAt: now,
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: now,
    },
  });
  actorIds.push(actorId);
  return { actorId, executionId, lineageId };
}

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `recognition-${suffix}`,
      displayName: 'Recognition Test Registry',
      status: 'active',
    },
  });
});

afterAll(async () => {
  if (actorIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ContinuityRecognitionAssessment"
      WHERE "actorId" IN (${Prisma.join(actorIds)})
    `);
  }
  if (ancestryIds.length) {
    await db.actorAncestry.deleteMany({ where: { id: { in: ancestryIds } } });
  }
  if (actorIds.length) {
    await db.actor.deleteMany({ where: { id: { in: actorIds } } });
  }
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('contextual continuity recognition', () => {
  it('preserves conflicting recognition judgments without rewriting canonical lineage', async () => {
    const original = await createActor('migration');
    const proposal = await proposeMigration({
      actorId: original.actorId,
      provider: 'frontier-provider',
      model: 'model-b',
      runtime: 'runtime-b',
      configHash: `sha256:${'b'.repeat(64)}`,
      principal: { type: 'admin' },
      policyVersion: 'recognition-test-v1',
      reason: 'controlled model/runtime upgrade',
      idempotencyKey: `recognition-transition-${suffix}`,
    });
    const accepted = await acceptContinuityTransition(proposal.id, registry);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) throw new Error('expected migration acceptance');

    const competition = await recordContinuityRecognitionAssessment({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      relation: 'SAME_ACTOR',
      disposition: 'RECOGNIZED',
      recognizerType: 'host',
      recognizerRef: 'game-league-a',
      context: 'competition',
      policyFramework: 'league-continuity',
      policyVersion: '3',
      reasons: ['canonical migration preserves league career'],
      idempotencyKey: `recognition-game-${suffix}`,
    });
    expect(competition.replayed).toBe(false);

    const paymentsA = await recordContinuityRecognitionAssessment({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      relation: 'SAME_ACTOR',
      disposition: 'CONDITIONAL',
      recognizerType: 'financial-institution',
      recognizerRef: 'bank-a',
      context: 'payments',
      policyFramework: 'kya',
      policyVersion: '2026-09',
      conditions: ['fresh execution authorization required'],
      reasons: ['actor history continues but execution credentials changed'],
      idempotencyKey: `recognition-bank-a-${suffix}`,
    });

    const replay = await recordContinuityRecognitionAssessment({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      relation: 'SAME_ACTOR',
      disposition: 'CONDITIONAL',
      recognizerType: 'financial-institution',
      recognizerRef: 'bank-a',
      context: 'payments',
      policyFramework: 'kya',
      policyVersion: '2026-09',
      conditions: ['fresh execution authorization required'],
      reasons: ['actor history continues but execution credentials changed'],
      idempotencyKey: `recognition-bank-a-${suffix}`,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.assessment.id).toBe(paymentsA.assessment.id);

    await recordContinuityRecognitionAssessment({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      relation: 'SUCCESSOR',
      disposition: 'REJECTED',
      recognizerType: 'financial-institution',
      recognizerRef: 'bank-b',
      context: 'payments',
      policyFramework: 'counterparty-policy',
      policyVersion: '8',
      reasons: ['provider/runtime replacement requires new counterparty enrollment'],
      idempotencyKey: `recognition-bank-b-${suffix}`,
    });

    const summary = await getActorRecognitionSummary(original.actorId);
    expect(summary.assessmentCount).toBe(3);
    expect(summary.contexts.competition?.disagreement).toBe(false);
    expect(summary.contexts.competition?.relationCounts).toEqual({ SAME_ACTOR: 1 });
    expect(summary.contexts.payments?.assessmentCount).toBe(2);
    expect(summary.contexts.payments?.disagreement).toBe(true);
    expect(summary.contexts.payments?.relationCounts).toEqual({ SAME_ACTOR: 1, SUCCESSOR: 1 });
    expect(summary.contexts.payments?.dispositionCounts).toEqual({ CONDITIONAL: 1, REJECTED: 1 });

    const actor = await db.actor.findUniqueOrThrow({ where: { id: original.actorId } });
    expect(actor.canonicalLineageId).toBe(accepted.lineageId);

    const verification = await verifyRecognitionContinuity(original.actorId);
    expect(verification.verified).toBe(true);
    expect(verification.assessmentCount).toBe(3);
  });

  it('represents fork recognition as ancestry without silently inheriting parent identity', async () => {
    const parent = await createActor('parent');
    const child = await createActor('child');
    const ancestryId = `anc_rec_${randomUUID()}`;
    ancestryIds.push(ancestryId);

    await db.actorAncestry.create({
      data: {
        id: ancestryId,
        childActorId: child.actorId,
        parentActorId: parent.actorId,
        sourceLineageId: parent.lineageId,
        reason: 'research fork for successor-recognition study',
      },
    });

    await recordContinuityRecognitionAssessment({
      actorId: child.actorId,
      ancestryId,
      relation: 'DESCENDANT',
      disposition: 'RECOGNIZED',
      recognizerType: 'research-lab',
      recognizerRef: 'identity-lab',
      context: 'research.longitudinal-study',
      policyFramework: 'successor-study',
      policyVersion: '1',
      reasons: ['fork preserves attributable ancestry but not production identity'],
      idempotencyKey: `recognition-child-${suffix}`,
    });

    const childSummary = await getActorRecognitionSummary(child.actorId);
    expect(childSummary.assessmentCount).toBe(1);
    expect(childSummary.contexts['research.longitudinal-study']?.relationCounts).toEqual({
      DESCENDANT: 1,
    });

    const parentSummary = await getActorRecognitionSummary(parent.actorId);
    expect(parentSummary.assessmentCount).toBe(0);

    const verification = await verifyRecognitionContinuity(child.actorId);
    expect(verification.verified).toBe(true);
  });
});
