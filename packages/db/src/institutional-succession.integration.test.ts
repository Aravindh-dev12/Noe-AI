import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import {
  activateInstitutionalSuccession,
  addInstitutionalSuccessionItem,
  createCommitment,
  createInstitutionalSuccessionAgreement,
  db,
  getActorInstitutionalSuccessionSummary,
  recordContinuityRecognitionAssessment,
  recordInstitutionalSuccessionConsent,
  registerEvidenceReference,
  verifyInstitutionalSuccession,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_succession_${suffix}`;
const actorIds: string[] = [];
const ancestryIds: string[] = [];
const evidenceIds = new Set<string>();

const registry = {
  signingSecret: 'test-succession-signing-secret-that-is-long-enough',
  hostId,
  environmentVersion: 'noeone-succession@test',
  issuer: 'noeone-test',
} as const;

async function createActor(label: string) {
  const actorId = `act_succ_${label}_${randomUUID()}`;
  const executionId = `exec_succ_${label}_${randomUUID()}`;
  const lineageId = `lin_succ_${label}_${randomUUID()}`;
  const now = new Date();

  await db.actor.create({
    data: {
      id: actorId,
      handle: `succ-${label}-${randomUUID()}`.slice(0, 32),
      displayName: `Succession ${label}`,
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
  return { actorId, lineageId };
}

async function bindSharedEvidence(actorId: string, role: string, digest: string) {
  const result = await registerEvidenceReference(
    {
      actorId,
      role,
      kind: 'institutional-succession-agreement',
      issuer: `succession-test-${suffix}`,
      digest,
      artifactMetadata: { test: 'institutional-succession' },
      bindingMetadata: { role },
    },
    registry,
  );
  evidenceIds.add(result.artifact.id);
  return result.artifact.id;
}

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `succession-${suffix}`,
      displayName: 'Succession Test Registry',
      status: 'active',
    },
  });
});

afterAll(async () => {
  if (actorIds.length) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "InstitutionalSuccessionAgreement"
      WHERE "predecessorActorId" IN (${Prisma.join(actorIds)})
         OR "successorActorId" IN (${Prisma.join(actorIds)})
    `);
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "ContinuityRecognitionAssessment"
      WHERE "actorId" IN (${Prisma.join(actorIds)})
    `);
  }
  if (ancestryIds.length) {
    await db.actorAncestry.deleteMany({ where: { id: { in: ancestryIds } } });
  }
  if (actorIds.length) {
    await db.commitmentTransition.deleteMany({ where: { commitment: { debtorActorId: { in: actorIds } } } });
    await db.commitment.deleteMany({
      where: {
        OR: [
          { debtorActorId: { in: actorIds } },
          { creditorActorId: { in: actorIds } },
        ],
      },
    });
    await db.actorEvidenceBinding.deleteMany({ where: { actorId: { in: actorIds } } });
  }
  if (evidenceIds.size) {
    await db.evidenceValidation.deleteMany({
      where: { evidenceArtifactId: { in: [...evidenceIds] } },
    });
    await db.evidenceArtifact.deleteMany({ where: { id: { in: [...evidenceIds] } } });
  }
  if (actorIds.length) {
    await db.actor.deleteMany({ where: { id: { in: actorIds } } });
  }
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('institutional succession', () => {
  it('requires explicit consent before a recognized successor receives an obligation', async () => {
    const predecessor = await createActor('predecessor');
    const successor = await createActor('successor');
    const creditor = await createActor('creditor');

    const ancestryId = `anc_succ_${randomUUID()}`;
    ancestryIds.push(ancestryId);
    await db.actorAncestry.create({
      data: {
        id: ancestryId,
        childActorId: successor.actorId,
        parentActorId: predecessor.actorId,
        sourceLineageId: predecessor.lineageId,
        reason: 'controlled successor candidate',
      },
    });

    const recognition = await recordContinuityRecognitionAssessment({
      actorId: successor.actorId,
      ancestryId,
      relation: 'SUCCESSOR',
      disposition: 'RECOGNIZED',
      recognizerType: 'counterparty-policy',
      recognizerRef: `recognizer-${suffix}`,
      context: 'contracting',
      policyFramework: 'succession-test',
      policyVersion: '1',
      reasons: ['recognized successor does not inherit obligations automatically'],
      idempotencyKey: `recognition-successor-${suffix}`,
    });

    const agreementDigest = `sha256:${'b'.repeat(64)}`;
    const evidenceId = await bindSharedEvidence(
      predecessor.actorId,
      'succession-predecessor',
      agreementDigest,
    );
    await bindSharedEvidence(successor.actorId, 'succession-successor', agreementDigest);
    await bindSharedEvidence(creditor.actorId, 'succession-counterparty', agreementDigest);

    const source = await createCommitment(
      {
        debtorActorId: predecessor.actorId,
        creditorActorId: creditor.actorId,
        kind: 'service-delivery',
        termsDigest: `sha256:${'c'.repeat(64)}`,
        sourceEvidenceArtifactId: evidenceId,
        principal: { type: 'admin' },
        idempotencyKey: `source-commitment-${suffix}`,
      },
      registry,
    );

    await createCommitment(
      {
        debtorActorId: predecessor.actorId,
        creditorActorId: creditor.actorId,
        kind: 'unrelated-obligation',
        termsDigest: `sha256:${'d'.repeat(64)}`,
        sourceEvidenceArtifactId: evidenceId,
        principal: { type: 'admin' },
        idempotencyKey: `unrelated-commitment-${suffix}`,
      },
      registry,
    );

    expect(await db.commitment.count({ where: { debtorActorId: successor.actorId } })).toBe(0);

    const proposed = await createInstitutionalSuccessionAgreement({
      predecessorActorId: predecessor.actorId,
      successorActorId: successor.actorId,
      successionKind: 'NOVATION',
      context: 'contracting',
      policyFramework: 'test-novation',
      policyVersion: '1',
      sourceEvidenceArtifactId: evidenceId,
      recognitionAssessmentId: recognition.assessment.id,
      parties: [
        {
          role: 'PREDECESSOR',
          principalType: 'actor',
          principalRef: predecessor.actorId,
        },
        {
          role: 'SUCCESSOR',
          principalType: 'actor',
          principalRef: successor.actorId,
        },
        {
          role: 'COUNTERPARTY',
          principalType: 'actor',
          principalRef: creditor.actorId,
        },
      ],
      idempotencyKey: `succession-agreement-${suffix}`,
      metadata: { scenario: 'recognized-successor-novation' },
    });

    const item = await addInstitutionalSuccessionItem({
      agreementId: proposed.agreement.id,
      itemType: 'DEBTOR_NOVATION',
      sourceCommitmentId: source.commitment.id,
      predecessorLiabilityMode: 'RELEASED',
      idempotencyKey: `succession-item-${suffix}`,
    });
    expect(item.item.status).toBe('PENDING');

    await expect(
      activateInstitutionalSuccession(proposed.agreement.id, registry),
    ).rejects.toThrow(/does not have current CONSENTED disposition/);
    expect(await db.commitment.count({ where: { debtorActorId: successor.actorId } })).toBe(0);

    for (const party of proposed.parties) {
      await recordInstitutionalSuccessionConsent({
        agreementId: proposed.agreement.id,
        partyId: party.id,
        disposition: 'CONSENTED',
        evidenceArtifactId: evidenceId,
        method: 'signed-agreement',
        methodVersion: '1',
        reasons: [`${party.role.toLowerCase()} consent recorded`],
        idempotencyKey: `consent-${party.id}-${suffix}`,
      });
    }

    const activated = await activateInstitutionalSuccession(proposed.agreement.id, registry);
    expect(activated.replayed).toBe(false);
    expect(activated.agreement.status).toBe('EFFECTIVE');

    const effectiveItem = activated.items.find((candidate) => candidate.id === item.item.id)!;
    expect(effectiveItem.status).toBe('EFFECTIVE');
    expect(effectiveItem.resultingCommitmentId).toBeTruthy();

    const resultCommitment = await db.commitment.findUniqueOrThrow({
      where: { id: effectiveItem.resultingCommitmentId! },
    });
    expect(resultCommitment.debtorActorId).toBe(successor.actorId);
    expect(resultCommitment.creditorActorId).toBe(creditor.actorId);
    expect(resultCommitment.termsDigest).toBe(source.commitment.termsDigest);

    const original = await db.commitment.findUniqueOrThrow({ where: { id: source.commitment.id } });
    expect(original.debtorActorId).toBe(predecessor.actorId);
    expect(original.status).toBe('OPEN');

    expect(await db.commitment.count({ where: { debtorActorId: predecessor.actorId } })).toBe(2);
    expect(await db.commitment.count({ where: { debtorActorId: successor.actorId } })).toBe(1);

    const successorSummary = await getActorInstitutionalSuccessionSummary(successor.actorId);
    expect(successorSummary.successorAgreementCount).toBe(1);
    expect(successorSummary.effectiveAgreementCount).toBe(1);
    expect(successorSummary.commitmentTransfersIn).toBe(1);

    const predecessorSummary = await getActorInstitutionalSuccessionSummary(predecessor.actorId);
    expect(predecessorSummary.commitmentTransfersOut).toBe(1);

    const [successorVerification, predecessorVerification] = await Promise.all([
      verifyInstitutionalSuccession(successor.actorId),
      verifyInstitutionalSuccession(predecessor.actorId),
    ]);
    expect(successorVerification.verified).toBe(true);
    expect(predecessorVerification.verified).toBe(true);

    const replay = await activateInstitutionalSuccession(proposed.agreement.id, registry);
    expect(replay.replayed).toBe(true);
    expect(await db.commitment.count({ where: { debtorActorId: successor.actorId } })).toBe(1);
  });
});