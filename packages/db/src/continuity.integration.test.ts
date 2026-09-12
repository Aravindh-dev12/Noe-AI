import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  acceptContinuityTransition,
  db,
  proposeMigration,
  type ProposeMigrationInput,
} from './index.js';

const SIGNING_SECRET = 'test-continuity-signing-secret-that-is-long-enough';
const suffix = randomUUID();
const hostId = `host_continuity_${suffix}`;

const registry = {
  signingSecret: SIGNING_SECRET,
  hostId,
  environmentVersion: 'noeone-core@test',
  issuer: 'noeone-test',
} as const;

async function createTestActor(label: string) {
  const actorId = `act_${label}_${randomUUID()}`;
  const executionId = `exec_${label}_${randomUUID()}`;
  const lineageId = `lin_${label}_${randomUUID()}`;

  await db.actor.create({
    data: {
      id: actorId,
      handle: `${label}-${randomUUID()}`.slice(0, 32),
      displayName: `Continuity ${label}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: new Date(),
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
      startedAt: new Date(),
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: new Date(),
    },
  });

  return { actorId, executionId, lineageId };
}

function proposal(
  actorId: string,
  model: string,
  hashChar: string,
): ProposeMigrationInput {
  return {
    actorId,
    provider: 'mock',
    model,
    runtime: 'runtime-b',
    configHash: `sha256:${hashChar.repeat(64)}`,
    principal: { type: 'admin' },
    policyVersion: 'test-owner-direct-v1',
    reason: `move to ${model}`,
  };
}

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `continuity-${suffix}`,
      displayName: 'Continuity Test Registry',
      status: 'active',
    },
  });
});

afterAll(async () => {
  await db.actor.deleteMany({ where: { displayName: { startsWith: 'Continuity ' } } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('continuity governance', () => {
  it('atomically advances one actor across an execution migration', async () => {
    const original = await createTestActor('atomic');
    const proposed = await proposeMigration(proposal(original.actorId, 'model-b', 'b'));
    const decision = await acceptContinuityTransition(proposed.id, registry);

    expect(decision.accepted).toBe(true);
    if (!decision.accepted) throw new Error('expected transition acceptance');

    const actor = await db.actor.findUniqueOrThrow({ where: { id: original.actorId } });
    const liveExecutions = await db.actorExecution.findMany({
      where: { actorId: original.actorId, endedAt: null },
    });
    const canonicalLineage = await db.lineageNode.findMany({
      where: { actorId: original.actorId, canonical: true },
    });
    const oldExecution = await db.actorExecution.findUniqueOrThrow({
      where: { id: original.executionId },
    });
    const event = await db.actorEvent.findUniqueOrThrow({
      where: { sourceKey: `continuity:${proposed.id}:accepted` },
    });

    expect(actor.id).toBe(original.actorId);
    expect(actor.canonicalLineageId).toBe(decision.lineageId);
    expect(liveExecutions).toHaveLength(1);
    expect(liveExecutions[0]!.id).toBe(decision.executionId);
    expect(liveExecutions[0]!.model).toBe('model-b');
    expect(canonicalLineage).toHaveLength(1);
    expect(canonicalLineage[0]!.id).toBe(decision.lineageId);
    expect(oldExecution.endedAt).not.toBeNull();
    expect(event.type).toBe('actor.continuity.transition.accepted');

    const replay = await acceptContinuityTransition(proposed.id, registry);
    expect(replay.accepted).toBe(true);
    if (!replay.accepted) throw new Error('expected replay acceptance');
    expect(replay.replayed).toBe(true);
    expect(replay.executionId).toBe(decision.executionId);
  });

  it('supersedes a proposal whose exact predecessor is no longer canonical', async () => {
    const original = await createTestActor('stale');
    const first = await proposeMigration(proposal(original.actorId, 'model-b', 'b'));
    const stale = await proposeMigration(proposal(original.actorId, 'model-c', 'c'));

    const accepted = await acceptContinuityTransition(first.id, registry);
    expect(accepted.accepted).toBe(true);

    const staleDecision = await acceptContinuityTransition(stale.id, registry);
    expect(staleDecision.accepted).toBe(false);
    if (staleDecision.accepted) throw new Error('expected stale transition rejection');
    expect(staleDecision.transition.status).toBe('SUPERSEDED');
    expect(staleDecision.reason).toMatch(/lineage advanced|execution changed/i);

    const liveExecutions = await db.actorExecution.findMany({
      where: { actorId: original.actorId, endedAt: null },
    });
    expect(liveExecutions).toHaveLength(1);
    expect(liveExecutions[0]!.model).toBe('model-b');
  });

  it('allows only one of two concurrent candidates to advance the same head', async () => {
    const original = await createTestActor('race');
    const first = await proposeMigration(proposal(original.actorId, 'model-b', 'b'));
    const second = await proposeMigration(proposal(original.actorId, 'model-c', 'c'));

    const decisions = await Promise.all([
      acceptContinuityTransition(first.id, registry),
      acceptContinuityTransition(second.id, registry),
    ]);

    expect(decisions.filter((decision) => decision.accepted)).toHaveLength(1);
    expect(decisions.filter((decision) => !decision.accepted)).toHaveLength(1);

    const transitions = await db.continuityTransition.findMany({
      where: { actorId: original.actorId },
    });
    expect(transitions.filter((transition) => transition.status === 'ACCEPTED')).toHaveLength(1);
    expect(transitions.filter((transition) => transition.status === 'SUPERSEDED')).toHaveLength(1);

    const liveExecutions = await db.actorExecution.count({
      where: { actorId: original.actorId, endedAt: null },
    });
    const canonicalHeads = await db.lineageNode.count({
      where: { actorId: original.actorId, canonical: true },
    });
    expect(liveExecutions).toBe(1);
    expect(canonicalHeads).toBe(1);
  });

  it('deduplicates identical migration proposals against the same head', async () => {
    const original = await createTestActor('dedupe');
    const input = proposal(original.actorId, 'model-b', 'b');

    const first = await proposeMigration(input);
    const second = await proposeMigration(input);

    expect(second.id).toBe(first.id);
    expect(
      await db.continuityTransition.count({ where: { actorId: original.actorId } }),
    ).toBe(1);
  });
});
