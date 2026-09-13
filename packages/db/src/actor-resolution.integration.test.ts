import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  addActorResolutionItem,
  closeActorResolutionCaseAtomic,
  confirmActorResolutionItemAction,
  db,
  discoverActorResolutionInventory,
  freezeActorResolutionCaseAtomic,
  getActorResolutionCase,
  openActorResolutionCase,
  recordActorResolutionDecisionSafely,
  verifyActorResolutionCase,
  verifyActorResolutionConfirmations,
} from './index.js';

const suffix = randomUUID();
const actorIds: string[] = [];
const evidenceIds: string[] = [];
const authorityIds: string[] = [];
const commitmentIds: string[] = [];

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function createActor(label: string) {
  const actorId = `act_resolution_${label}_${randomUUID()}`;
  const executionId = `exec_resolution_${label}_${randomUUID()}`;
  const lineageId = `lin_resolution_${label}_${randomUUID()}`;
  const now = new Date();

  await db.actor.create({
    data: {
      id: actorId,
      handle: `res-${label}-${randomUUID()}`.slice(0, 32),
      displayName: `Resolution ${label}`,
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
      model: 'resolution-model',
      runtime: 'resolution-runtime',
      configHash: digest(`${actorId}:execution`),
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

async function createEvidence(label: string) {
  const id = `evidence_resolution_${label}_${randomUUID()}`;
  await db.evidenceArtifact.create({
    data: {
      id,
      kind: 'resolution-confirmation',
      issuer: 'resolution-test-authority',
      digest: digest(`${label}:${id}`),
      observedAt: new Date(),
      metadata: { test: true },
    },
  });
  evidenceIds.push(id);
  return id;
}

async function seedOpenAuthority(actorId: string) {
  const id = `auth_resolution_${randomUUID()}`;
  await db.authorityGrant.create({
    data: {
      id,
      subjectActorId: actorId,
      grantorType: 'user',
      grantorRef: 'principal:resolution-test',
      status: 'ACTIVE',
      actions: ['purchase'],
      resources: ['catalog:test'],
      canRedelegate: false,
      remainingDelegationDepth: 0,
      notBefore: new Date(),
      issuedByType: 'admin',
      idempotencyKey: `authority-resolution-${suffix}-${id}`,
      metadata: { test: true },
    },
  });
  authorityIds.push(id);
  return id;
}

async function seedOpenCommitment(actorId: string) {
  const id = `commitment_resolution_${randomUUID()}`;
  await db.commitment.create({
    data: {
      id,
      debtorActorId: actorId,
      creditorExternalRef: 'supplier:resolution-test',
      kind: 'delivery',
      status: 'OPEN',
      termsDigest: digest(`${id}:terms`),
      dueAt: new Date(Date.now() + 86_400_000),
      createdByType: 'admin',
      idempotencyKey: `commitment-resolution-${suffix}-${id}`,
      metadata: { test: true },
    },
  });
  commitmentIds.push(id);
  return id;
}

afterAll(async () => {
  if (actorIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ActorResolutionCase" WHERE "actorId" IN (${Prisma.join(actorIds)})
    `);
  }
  if (commitmentIds.length) {
    await db.commitment.deleteMany({ where: { id: { in: commitmentIds } } });
  }
  if (authorityIds.length) {
    await db.authorityGrantTransition.deleteMany({ where: { grantId: { in: authorityIds } } });
    await db.authorityGrant.deleteMany({ where: { id: { in: authorityIds } } });
  }
  if (evidenceIds.length) {
    await db.evidenceArtifact.deleteMany({ where: { id: { in: evidenceIds } } });
  }
  if (actorIds.length) {
    await db.actor.deleteMany({ where: { id: { in: actorIds } } });
  }
  await db.$disconnect();
});

describe('actor resolution after continuity failure', () => {
  it('freezes operations, inventories distributed state, requires confirmation, and preserves explicit orphaning', async () => {
    const actor = await createActor('principal-loss');
    const authorityId = await seedOpenAuthority(actor.actorId);
    const commitmentId = await seedOpenCommitment(actor.actorId);

    const opened = await openActorResolutionCase({
      actorId: actor.actorId,
      primaryTrigger: 'PRINCIPAL_LOSS',
      resolutionContext: 'Principal can no longer authorize continued autonomous operation.',
      openedByType: 'admin',
      openedByRef: 'resolution-test',
      freezePolicyVersion: 'resolution-test-v1',
      idempotencyKey: `resolution-open-${suffix}`,
      metadata: { drill: 'principal-loss' },
    });
    expect(opened.replayed).toBe(false);

    const replay = await openActorResolutionCase({
      actorId: actor.actorId,
      primaryTrigger: 'PRINCIPAL_LOSS',
      resolutionContext: 'Principal can no longer authorize continued autonomous operation.',
      openedByType: 'admin',
      openedByRef: 'resolution-test',
      freezePolicyVersion: 'resolution-test-v1',
      idempotencyKey: `resolution-open-${suffix}`,
      metadata: { drill: 'principal-loss' },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.case.id).toBe(opened.case.id);

    const frozen = await freezeActorResolutionCaseAtomic({
      caseId: opened.case.id,
      decidedByType: 'admin',
      decidedByRef: 'resolution-test',
      reason: 'freeze NOEONE-controlled operations while external state is inventoried',
      idempotencyKey: `resolution-freeze-${suffix}`,
    });
    expect(frozen.case.status).toBe('FROZEN');
    const pausedActor = await db.actor.findUniqueOrThrow({ where: { id: actor.actorId } });
    expect(pausedActor.status).toBe('PAUSED');

    const inventory = await discoverActorResolutionInventory(opened.case.id);
    expect(inventory.itemCount).toBeGreaterThanOrEqual(2);
    expect(inventory.items.some((item) => item.sourceType === 'AuthorityGrant' && item.sourceRef === authorityId)).toBe(true);
    expect(inventory.items.some((item) => item.sourceType === 'Commitment' && item.sourceRef === commitmentId)).toBe(true);

    const state = await getActorResolutionCase(opened.case.id);
    const authorityItem = state.items.find((item) => item.sourceType === 'AuthorityGrant' && item.sourceRef === authorityId);
    const commitmentItem = state.items.find((item) => item.sourceType === 'Commitment' && item.sourceRef === commitmentId);
    expect(authorityItem).toBeDefined();
    expect(commitmentItem).toBeDefined();
    if (!authorityItem || !commitmentItem) throw new Error('expected discovered resolution items');

    const authorityDecision = await recordActorResolutionDecisionSafely({
      itemId: authorityItem.id,
      disposition: 'REVOKE',
      decidedByType: 'admin',
      decidedByRef: 'resolution-test',
      reason: 'authority must be revoked by the controlling principal/issuer',
      idempotencyKey: `resolution-authority-decision-${suffix}`,
    });
    expect(authorityDecision.replayed).toBe(false);

    const awaitingConfirmation = await getActorResolutionCase(opened.case.id);
    expect(awaitingConfirmation.items.find((item) => item.id === authorityItem.id)?.status).toBe('ACTION_REQUESTED');

    await expect(
      closeActorResolutionCaseAtomic({
        caseId: opened.case.id,
        finalDisposition: 'NO_OPERATIONAL_CONTINUATION',
        decidedByType: 'admin',
        idempotencyKey: `resolution-close-too-early-${suffix}`,
      }),
    ).rejects.toThrow(/unresolved item/i);

    const confirmationEvidenceId = await createEvidence('authority-revoked');
    const confirmed = await confirmActorResolutionItemAction({
      itemId: authorityItem.id,
      decisionId: authorityDecision.decision.id,
      evidenceArtifactId: confirmationEvidenceId,
      confirmerType: 'authority-issuer',
      confirmerRef: 'principal:resolution-test',
      externalFramework: 'noeone-authority-test',
      externalReference: authorityId,
      idempotencyKey: `resolution-authority-confirm-${suffix}`,
    });
    expect(confirmed.replayed).toBe(false);

    const orphaned = await recordActorResolutionDecisionSafely({
      itemId: commitmentItem.id,
      disposition: 'ORPHAN',
      decidedByType: 'admin',
      decidedByRef: 'resolution-test',
      reason: 'No legitimate successor or settlement path exists in this drill.',
      idempotencyKey: `resolution-commitment-orphan-${suffix}`,
    });
    expect(orphaned.decision.disposition).toBe('ORPHAN');

    const beforeClose = await getActorResolutionCase(opened.case.id);
    expect(beforeClose.items.find((item) => item.id === authorityItem.id)?.status).toBe('CONFIRMED');
    expect(beforeClose.items.find((item) => item.id === commitmentItem.id)?.status).toBe('ORPHANED');

    const closed = await closeActorResolutionCaseAtomic({
      caseId: opened.case.id,
      finalDisposition: 'NO_OPERATIONAL_CONTINUATION',
      decidedByType: 'admin',
      decidedByRef: 'resolution-test',
      reason: 'All discovered items are terminal for the declared resolution context.',
      idempotencyKey: `resolution-close-${suffix}`,
    });
    expect(closed.case.status).toBe('RESOLVED');
    expect(closed.case.finalDisposition).toBe('NO_OPERATIONAL_CONTINUATION');

    const retiredActor = await db.actor.findUniqueOrThrow({ where: { id: actor.actorId } });
    expect(retiredActor.status).toBe('RETIRED');

    const coreVerification = await verifyActorResolutionCase(opened.case.id);
    const confirmationVerification = await verifyActorResolutionConfirmations(opened.case.id);
    expect(coreVerification.verified).toBe(true);
    expect(confirmationVerification.verified).toBe(true);
    expect(confirmationVerification.confirmationCount).toBe(1);

    await expect(
      addActorResolutionItem({
        caseId: opened.case.id,
        itemClass: 'OTHER',
        sourceType: 'late-test-state',
        sourceRef: 'late-state-1',
        sourceDigest: digest('late-state-1'),
        requiredAction: 'This write must be rejected after case resolution.',
        idempotencyKey: `resolution-late-item-${suffix}`,
      }),
    ).rejects.toThrow();
  });
});
