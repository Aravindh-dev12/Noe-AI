import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bindCollectiveAction,
  db,
  formCollective,
  getCollectiveActionProvenanceSummary,
  ratifyCollectiveAction,
  recordCollectiveCapacityAssessment,
  recordCollectiveDecision,
  transitionCollective,
  verifyCollectiveActionProvenance,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_collective_c2_${suffix}`;
const collectiveActorId = `act_collective_c2_${suffix}`;
const memberAId = `act_collective_member_a_${suffix}`;
const memberBId = `act_collective_member_b_${suffix}`;

const t0 = new Date('2026-09-01T00:00:00.000Z');
const t1 = new Date('2026-09-01T01:00:00.000Z');
const t2 = new Date('2026-09-01T02:00:00.000Z');
const tFutureDecision = new Date('2026-09-01T03:00:00.000Z');
const tPersonal = new Date('2026-09-01T03:10:00.000Z');
const tUnauthorized = new Date('2026-09-01T03:20:00.000Z');
const tTransition = new Date('2026-09-02T00:00:00.000Z');
const tRatificationDecision = new Date('2026-09-02T01:00:00.000Z');
const tRatified = new Date('2026-09-02T02:00:00.000Z');
const tAssessmentA = new Date('2026-09-02T03:00:00.000Z');
const tAssessmentB = new Date('2026-09-02T03:05:00.000Z');

const registry = {
  signingSecret: 'test-collective-c2-signing-secret-that-is-long-enough',
  hostId,
  environmentVersion: 'noe.collective-action-provenance@test',
  issuer: 'noeone-test',
} as const;

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(`${suffix}:${value}`).digest('hex')}`;
}

async function createEvidence(label: string, observedAt: Date) {
  const id = `evidence_c2_${label}_${randomUUID()}`;
  await db.evidenceArtifact.create({
    data: {
      id,
      kind: `collective-c2.${label}`,
      issuer: `collective-c2-test:${suffix}`,
      digest: digest(`evidence:${label}`),
      observedAt,
      metadata: { label },
    },
  });
  return id;
}

async function createActor(id: string, label: string, actorType: 'ORGANIZATION' | 'RESEARCH') {
  const lineageId = `lin_${label}_${suffix}`;
  await db.actor.create({
    data: {
      id,
      handle: `c2-${label}-${suffix}`.slice(0, 32),
      displayName: `C2 ${label}`,
      actorType,
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId: id,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  });
}

let formationEvidenceId: string;
let transitionEvidenceId: string;
let decisionEvidenceId: string;
let futureDecisionEvidenceId: string;
let actionEvidenceId: string;
let personalEvidenceId: string;
let unauthorizedEvidenceId: string;
let ratificationDecisionEvidenceId: string;
let ratificationEvidenceId: string;
let assessmentAEvidenceId: string;
let assessmentBEvidenceId: string;
let firstEpochId: string;
let secondEpochId: string;
let firstDecisionId: string;
let futureDecisionId: string;
let unauthorizedBindingId: string;

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `collective-c2-${suffix}`,
      displayName: 'Collective C2 Test Registry',
      status: 'active',
    },
  });
  await createActor(collectiveActorId, 'collective', 'ORGANIZATION');
  await createActor(memberAId, 'member-a', 'RESEARCH');
  await createActor(memberBId, 'member-b', 'RESEARCH');

  formationEvidenceId = await createEvidence('formation', t0);
  transitionEvidenceId = await createEvidence('transition', tTransition);
  decisionEvidenceId = await createEvidence('decision-initial', t1);
  futureDecisionEvidenceId = await createEvidence('decision-future', tFutureDecision);
  actionEvidenceId = await createEvidence('action-on-behalf', t2);
  personalEvidenceId = await createEvidence('action-personal', tPersonal);
  unauthorizedEvidenceId = await createEvidence('action-unauthorized', tUnauthorized);
  ratificationDecisionEvidenceId = await createEvidence(
    'decision-ratification',
    tRatificationDecision,
  );
  ratificationEvidenceId = await createEvidence('ratification', tRatified);
  assessmentAEvidenceId = await createEvidence('assessment-a', tAssessmentA);
  assessmentBEvidenceId = await createEvidence('assessment-b', tAssessmentB);

  const formed = await formCollective(
    {
      collectiveActorId,
      governanceMethod: 'weighted-board',
      constitutionDigest: digest('constitution-v1'),
      topologyDigest: digest('topology-v1'),
      decisionPolicyDigest: digest('decision-policy-v1'),
      formationEvidenceArtifactId: formationEvidenceId,
      roster: [
        { memberActorId: memberAId, role: 'director', weightBps: 6_000 },
        { memberActorId: memberBId, role: 'reviewer', weightBps: 4_000 },
      ],
      formedAt: t0,
      idempotencyKey: `collective-c2-formation-${suffix}`,
    },
    registry,
  );
  firstEpochId = formed.summary?.epochs[0]?.id ?? '';
  if (!firstEpochId) throw new Error('expected first collective epoch');
});

afterAll(async () => {
  await db.$disconnect();
});

describe('collective action provenance C2', () => {
  it('pins a decision to immutable epoch participants and replays idempotently', async () => {
    const input = {
      collectiveActorId,
      epochId: firstEpochId,
      decisionType: 'approve-external-action',
      proposalDigest: digest('proposal-initial'),
      method: 'weighted-board-vote',
      methodVersion: '1',
      outcomeDigest: digest('outcome-approved'),
      quorumBps: 8_000,
      decidedAt: t1,
      evidenceArtifactId: decisionEvidenceId,
      participants: [
        { memberActorId: memberAId, position: 'approve' },
        { memberActorId: memberBId, position: 'approve' },
      ],
      idempotencyKey: `collective-c2-decision-initial-${suffix}`,
    };

    const first = await recordCollectiveDecision(input, registry);
    expect(first.replayed).toBe(false);
    expect(first.participants).toHaveLength(2);
    expect(first.participants.find((item) => item.memberActorId === memberAId)?.role).toBe('director');
    firstDecisionId = first.decision.id;

    const replay = await recordCollectiveDecision(input, registry);
    expect(replay.replayed).toBe(true);
    expect(replay.decision.id).toBe(firstDecisionId);
  });

  it('records on-behalf action without erasing member attribution', async () => {
    const result = await bindCollectiveAction(
      {
        collectiveActorId,
        epochId: firstEpochId,
        capacity: 'MEMBER_ON_BEHALF',
        actedAt: t2,
        sourceKind: 'EVIDENCE_ARTIFACT',
        sourceRef: actionEvidenceId,
        memberActorId: memberAId,
        decisionId: firstDecisionId,
        claimedAt: new Date('2026-09-01T02:05:00.000Z'),
        bindingEvidenceArtifactId: actionEvidenceId,
        idempotencyKey: `collective-c2-action-on-behalf-${suffix}`,
      },
      registry,
    );

    expect(result.binding.collectiveActorId).toBe(collectiveActorId);
    expect(result.binding.memberActorId).toBe(memberAId);
    expect(result.binding.capacity).toBe('MEMBER_ON_BEHALF');
    expect(result.binding.decisionId).toBe(firstDecisionId);
  });

  it('rejects a future decision as pre-authorization for a past action', async () => {
    const future = await recordCollectiveDecision(
      {
        collectiveActorId,
        epochId: firstEpochId,
        decisionType: 'late-approval',
        proposalDigest: digest('proposal-future'),
        method: 'board-majority',
        methodVersion: '1',
        outcomeDigest: digest('future-outcome'),
        decidedAt: tFutureDecision,
        evidenceArtifactId: futureDecisionEvidenceId,
        participants: [{ memberActorId: memberAId, position: 'approve' }],
        idempotencyKey: `collective-c2-decision-future-${suffix}`,
      },
      registry,
    );
    futureDecisionId = future.decision.id;

    await expect(
      bindCollectiveAction(
        {
          collectiveActorId,
          epochId: firstEpochId,
          capacity: 'MEMBER_ON_BEHALF',
          actedAt: new Date('2026-09-01T02:30:00.000Z'),
          sourceKind: 'EVIDENCE_ARTIFACT',
          sourceRef: actionEvidenceId,
          memberActorId: memberAId,
          decisionId: futureDecisionId,
          claimedAt: new Date('2026-09-01T03:05:00.000Z'),
          bindingEvidenceArtifactId: actionEvidenceId,
          idempotencyKey: `collective-c2-invalid-future-decision-${suffix}`,
        },
        registry,
      ),
    ).rejects.toThrow(/future collective decision/i);
  });

  it('keeps personal and unauthorized capacities distinct from collective authorization', async () => {
    const personal = await bindCollectiveAction(
      {
        collectiveActorId,
        epochId: firstEpochId,
        capacity: 'MEMBER_PERSONAL',
        actedAt: tPersonal,
        sourceKind: 'EVIDENCE_ARTIFACT',
        sourceRef: personalEvidenceId,
        memberActorId: memberBId,
        claimedAt: new Date('2026-09-01T03:11:00.000Z'),
        bindingEvidenceArtifactId: personalEvidenceId,
        idempotencyKey: `collective-c2-action-personal-${suffix}`,
      },
      registry,
    );
    expect(personal.binding.decisionId).toBeNull();

    const unauthorized = await bindCollectiveAction(
      {
        collectiveActorId,
        epochId: firstEpochId,
        capacity: 'UNAUTHORIZED_COLLECTIVE_CLAIM',
        actedAt: tUnauthorized,
        sourceKind: 'EVIDENCE_ARTIFACT',
        sourceRef: unauthorizedEvidenceId,
        memberActorId: memberAId,
        claimedAt: new Date('2026-09-01T03:21:00.000Z'),
        bindingEvidenceArtifactId: unauthorizedEvidenceId,
        idempotencyKey: `collective-c2-action-unauthorized-${suffix}`,
      },
      registry,
    );
    unauthorizedBindingId = unauthorized.binding.id;
    expect(unauthorized.binding.decisionId).toBeNull();
  });

  it('changes the roster epoch without rewriting old decision participants', async () => {
    const transitioned = await transitionCollective(
      {
        collectiveActorId,
        predecessorEpochId: firstEpochId,
        transitionKind: 'role_change',
        transitionEvidenceArtifactId: transitionEvidenceId,
        roster: [
          { memberActorId: memberAId, role: 'observer', weightBps: 6_000 },
          { memberActorId: memberBId, role: 'reviewer', weightBps: 4_000 },
        ],
        startedAt: tTransition,
        idempotencyKey: `collective-c2-role-transition-${suffix}`,
      },
      registry,
    );
    secondEpochId = transitioned.summary?.epochs.at(-1)?.id ?? '';
    if (!secondEpochId) throw new Error('expected second collective epoch');

    const summary = await getCollectiveActionProvenanceSummary(collectiveActorId);
    const oldParticipant = summary?.participations.find(
      (item) => item.decisionId === firstDecisionId && item.memberActorId === memberAId,
    );
    expect(oldParticipant?.role).toBe('director');

    const currentSnapshot = await db.collectiveEpochMembership.findUniqueOrThrow({
      where: { epochId_memberActorId: { epochId: secondEpochId, memberActorId: memberAId } },
    });
    expect(currentSnapshot.role).toBe('observer');
  });

  it('represents later ratification as a new fact instead of rewriting the original action', async () => {
    const decision = await recordCollectiveDecision(
      {
        collectiveActorId,
        epochId: secondEpochId,
        decisionType: 'ratify-prior-action',
        proposalDigest: digest('proposal-ratify'),
        method: 'weighted-board-vote',
        methodVersion: '2',
        outcomeDigest: digest('outcome-ratified'),
        decidedAt: tRatificationDecision,
        evidenceArtifactId: ratificationDecisionEvidenceId,
        participants: [
          { memberActorId: memberAId, position: 'approve' },
          { memberActorId: memberBId, position: 'approve' },
        ],
        idempotencyKey: `collective-c2-decision-ratify-${suffix}`,
      },
      registry,
    );

    const ratification = await ratifyCollectiveAction(
      {
        actionBindingId: unauthorizedBindingId,
        decisionId: decision.decision.id,
        ratifiedAt: tRatified,
        evidenceArtifactId: ratificationEvidenceId,
        idempotencyKey: `collective-c2-ratification-${suffix}`,
      },
      registry,
    );
    expect(ratification.replayed).toBe(false);

    const original = await db.collectiveActionBinding.findUniqueOrThrow({
      where: { id: unauthorizedBindingId },
    });
    expect(original.capacity).toBe('UNAUTHORIZED_COLLECTIVE_CLAIM');
    expect(original.decisionId).toBeNull();

    const replay = await ratifyCollectiveAction(
      {
        actionBindingId: unauthorizedBindingId,
        decisionId: decision.decision.id,
        ratifiedAt: tRatified,
        evidenceArtifactId: ratificationEvidenceId,
        idempotencyKey: `collective-c2-ratification-${suffix}`,
      },
      registry,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.ratification.id).toBe(ratification.ratification.id);
  });

  it('preserves evaluator disagreement and verifies the full provenance graph', async () => {
    await recordCollectiveCapacityAssessment(
      {
        actionBindingId: unauthorizedBindingId,
        evaluatorRef: 'governance-review:a',
        method: 'constitutional-capacity-review',
        methodVersion: '1',
        disposition: 'SUPPORTED',
        evidenceArtifactId: assessmentAEvidenceId,
        assessedAt: tAssessmentA,
        idempotencyKey: `collective-c2-assessment-a-${suffix}`,
      },
      registry,
    );
    await recordCollectiveCapacityAssessment(
      {
        actionBindingId: unauthorizedBindingId,
        evaluatorRef: 'external-counterparty:b',
        method: 'counterparty-attribution-policy',
        methodVersion: '7',
        disposition: 'NOT_SUPPORTED',
        evidenceArtifactId: assessmentBEvidenceId,
        assessedAt: tAssessmentB,
        idempotencyKey: `collective-c2-assessment-b-${suffix}`,
      },
      registry,
    );

    const summary = await getCollectiveActionProvenanceSummary(collectiveActorId);
    const assessments = summary?.assessments.filter(
      (item) => item.actionBindingId === unauthorizedBindingId,
    );
    expect(assessments?.map((item) => item.disposition).sort()).toEqual([
      'NOT_SUPPORTED',
      'SUPPORTED',
    ]);

    await expect(
      db.collectiveActionBinding.update({
        where: { id: unauthorizedBindingId },
        data: { capacity: 'MEMBER_ON_BEHALF' },
      }),
    ).rejects.toThrow(/immutable/i);

    const verification = await verifyCollectiveActionProvenance(collectiveActorId);
    expect(verification.verified).toBe(true);
    expect(verification.counts.decisions).toBe(3);
    expect(verification.counts.bindings).toBe(3);
    expect(verification.counts.ratifications).toBe(1);
    expect(verification.counts.assessments).toBe(2);
  });
});
