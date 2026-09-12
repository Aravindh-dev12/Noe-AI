import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  acceptContinuityTransition,
  db,
  getExternalStateContinuationSummary,
  proposeMigration,
  recordExternalStateContinuationDecision,
  verifyExternalStateContinuation,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_external_state_${suffix}`;
const actorIds: string[] = [];
const ancestryIds: string[] = [];

const registry = {
  signingSecret: 'test-external-state-signing-secret-that-is-long-enough',
  hostId,
  environmentVersion: 'noeone-external-state@test',
  issuer: 'noeone-test',
} as const;

async function createActor(label: string) {
  const actorId = `act_ext_${label}_${randomUUID()}`;
  const executionId = `exec_ext_${label}_${randomUUID()}`;
  const lineageId = `lin_ext_${label}_${randomUUID()}`;
  const now = new Date();

  await db.actor.create({
    data: {
      id: actorId,
      handle: `ext-${label}-${randomUUID()}`.slice(0, 32),
      displayName: `External State ${label}`,
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
      slug: `external-state-${suffix}`,
      displayName: 'External State Test Registry',
      status: 'active',
    },
  });
});

afterAll(async () => {
  if (actorIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ExternalStateContinuationDecision"
      WHERE "actorId" IN (${Prisma.join(actorIds)})
         OR "sourceActorId" IN (${Prisma.join(actorIds)})
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

describe('externally anchored state continuity', () => {
  it('lets an external principal supersede its own migration decision without rewriting actor continuity', async () => {
    const original = await createActor('migration');
    const proposal = await proposeMigration({
      actorId: original.actorId,
      provider: 'frontier-provider',
      model: 'model-b',
      runtime: 'runtime-b',
      configHash: `sha256:${'b'.repeat(64)}`,
      principal: { type: 'admin' },
      policyVersion: 'external-state-test-v1',
      reason: 'controlled model/runtime upgrade',
      idempotencyKey: `external-state-transition-${suffix}`,
    });
    const accepted = await acceptContinuityTransition(proposal.id, registry);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) throw new Error('expected migration acceptance');

    const earlier = new Date(Date.now() - 2_000);
    const later = new Date(Date.now() - 1_000);
    const sourceStateDigest = `sha256:${'c'.repeat(64)}`;

    const conditional = await recordExternalStateContinuationDecision({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      stateClass: 'INSTITUTIONAL_STATUS',
      sourceStateType: 'purchase-mandate',
      sourceStateRef: 'bank-a:mandate-42',
      sourceStateDigest,
      externalPrincipalType: 'financial-institution',
      externalPrincipalRef: 'bank-a',
      context: 'payments',
      disposition: 'CONDITIONAL',
      policyFramework: 'bank-agent-policy',
      policyVersion: '2026-09',
      conditions: ['fresh execution key verification required'],
      decidedAt: earlier,
      idempotencyKey: `external-state-bank-conditional-${suffix}`,
    });
    expect(conditional.replayed).toBe(false);
    expect(conditional.decision.sourceActorId).toBe(original.actorId);

    const replay = await recordExternalStateContinuationDecision({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      stateClass: 'INSTITUTIONAL_STATUS',
      sourceStateType: 'purchase-mandate',
      sourceStateRef: 'bank-a:mandate-42',
      sourceStateDigest,
      externalPrincipalType: 'financial-institution',
      externalPrincipalRef: 'bank-a',
      context: 'payments',
      disposition: 'CONDITIONAL',
      policyFramework: 'bank-agent-policy',
      policyVersion: '2026-09',
      conditions: ['fresh execution key verification required'],
      decidedAt: earlier,
      idempotencyKey: `external-state-bank-conditional-${suffix}`,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.decision.id).toBe(conditional.decision.id);

    await recordExternalStateContinuationDecision({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      stateClass: 'INSTITUTIONAL_STATUS',
      sourceStateType: 'purchase-mandate',
      sourceStateRef: 'bank-a:mandate-42',
      sourceStateDigest,
      externalPrincipalType: 'financial-institution',
      externalPrincipalRef: 'bank-a',
      context: 'payments',
      disposition: 'REISSUED',
      successorStateRef: 'bank-a:mandate-43',
      policyFramework: 'bank-agent-policy',
      policyVersion: '2026-09',
      reasons: ['new execution passed institution-specific verification'],
      decidedAt: later,
      idempotencyKey: `external-state-bank-reissued-${suffix}`,
    });

    await recordExternalStateContinuationDecision({
      actorId: original.actorId,
      continuityTransitionId: proposal.id,
      stateClass: 'RELATIONSHIP',
      sourceStateType: 'host-membership',
      sourceStateRef: 'league-a:member-7',
      sourceStateDigest: `sha256:${'d'.repeat(64)}`,
      externalPrincipalType: 'host',
      externalPrincipalRef: 'league-a',
      context: 'competition',
      disposition: 'CONTINUED',
      policyFramework: 'league-continuity',
      policyVersion: '4',
      reasons: ['canonical model migration preserves competition membership'],
      decidedAt: later,
      idempotencyKey: `external-state-league-${suffix}`,
    });

    const summary = await getExternalStateContinuationSummary(original.actorId);
    expect(summary.activeDecisionCount).toBe(2);
    expect(summary.dispositions).toEqual({ REISSUED: 1, CONTINUED: 1 });
    expect(summary.stateClasses).toEqual({ INSTITUTIONAL_STATUS: 1, RELATIONSHIP: 1 });
    expect(summary.contexts.payments?.dispositions).toEqual({ REISSUED: 1 });
    expect(summary.contexts.competition?.dispositions).toEqual({ CONTINUED: 1 });

    const actor = await db.actor.findUniqueOrThrow({ where: { id: original.actorId } });
    expect(actor.canonicalLineageId).toBe(accepted.lineageId);

    const verification = await verifyExternalStateContinuation(original.actorId);
    expect(verification.verified).toBe(true);
    expect(verification.decisionCount).toBe(3);
  });

  it('does not automatically transfer a parent institution status to a fork', async () => {
    const parent = await createActor('parent');
    const child = await createActor('child');
    const ancestryId = `anc_ext_${randomUUID()}`;
    ancestryIds.push(ancestryId);

    await db.actorAncestry.create({
      data: {
        id: ancestryId,
        childActorId: child.actorId,
        parentActorId: parent.actorId,
        sourceLineageId: parent.lineageId,
        reason: 'controlled research fork',
      },
    });

    const decision = await recordExternalStateContinuationDecision({
      actorId: child.actorId,
      ancestryId,
      stateClass: 'INSTITUTIONAL_STATUS',
      sourceStateType: 'research-network-membership',
      sourceStateRef: 'lab-network:member-22',
      sourceStateDigest: `sha256:${'e'.repeat(64)}`,
      externalPrincipalType: 'research-network',
      externalPrincipalRef: 'lab-network',
      context: 'research.membership',
      disposition: 'REJECTED',
      policyFramework: 'membership-succession',
      policyVersion: '2',
      reasons: ['fork ancestry is recognized but membership is not inherited'],
      idempotencyKey: `external-state-fork-${suffix}`,
    });

    expect(decision.decision.actorId).toBe(child.actorId);
    expect(decision.decision.sourceActorId).toBe(parent.actorId);

    const childSummary = await getExternalStateContinuationSummary(child.actorId);
    expect(childSummary.activeDecisionCount).toBe(1);
    expect(childSummary.dispositions).toEqual({ REJECTED: 1 });

    const parentSummary = await getExternalStateContinuationSummary(parent.actorId);
    expect(parentSummary.activeDecisionCount).toBe(0);

    const verification = await verifyExternalStateContinuation(child.actorId);
    expect(verification.verified).toBe(true);
  });

  it('requires a new state reference for REISSUED decisions', async () => {
    const original = await createActor('validation');
    const proposal = await proposeMigration({
      actorId: original.actorId,
      provider: 'mock',
      model: 'model-c',
      runtime: 'runtime-c',
      configHash: `sha256:${'f'.repeat(64)}`,
      principal: { type: 'admin' },
      policyVersion: 'external-state-test-v1',
      idempotencyKey: `external-state-validation-transition-${suffix}`,
    });
    const accepted = await acceptContinuityTransition(proposal.id, registry);
    expect(accepted.accepted).toBe(true);

    await expect(
      recordExternalStateContinuationDecision({
        actorId: original.actorId,
        continuityTransitionId: proposal.id,
        stateClass: 'INSTITUTIONAL_STATUS',
        sourceStateType: 'credential',
        sourceStateRef: 'issuer:credential-1',
        sourceStateDigest: `sha256:${'1'.repeat(64)}`,
        externalPrincipalType: 'issuer',
        externalPrincipalRef: 'issuer-a',
        context: 'credentialing',
        disposition: 'REISSUED',
        policyVersion: '1',
        idempotencyKey: `external-state-validation-${suffix}`,
      }),
    ).rejects.toThrow('successorStateRef is required');
  });
});
