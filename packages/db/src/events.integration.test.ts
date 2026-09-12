import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

const SIGNING_SECRET = 'test-event-signing-secret-that-is-long-enough';
const suffix = randomUUID();
const actorId = `act_test_${suffix}`;
const executionId = `exec_test_${suffix}`;
const lineageId = `lin_test_${suffix}`;
const hostId = `host_test_${suffix}`;

async function setup() {
  await db.host.create({
    data: {
      id: hostId,
      slug: `test-${suffix}`,
      displayName: 'Event Test Host',
    },
  });

  await db.actor.create({
    data: {
      id: actorId,
      handle: `test-${suffix}`,
      displayName: 'Event Test Actor',
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
      model: 'test-model',
      configHash: `test:${suffix}`,
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
}

afterAll(async () => {
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('appendCanonicalActorEvent', () => {
  it('deduplicates retries by sourceKey and serializes concurrent appends', async () => {
    await setup();

    const first = await db.$transaction((tx) =>
      appendCanonicalActorEvent(
        tx,
        {
          actorId,
          executionId,
          type: 'test.origin',
          sourceKey: `test:${suffix}:origin`,
          hostId,
          environmentVersion: 'test@1',
          issuer: 'integration-test',
          payload: { step: 1 },
        },
        SIGNING_SECRET,
      ),
    );

    const retry = await db.$transaction((tx) =>
      appendCanonicalActorEvent(
        tx,
        {
          actorId,
          executionId,
          type: 'test.origin',
          sourceKey: `test:${suffix}:origin`,
          hostId,
          environmentVersion: 'test@1',
          issuer: 'integration-test',
          payload: { step: 1 },
        },
        SIGNING_SECRET,
      ),
    );

    expect(retry.id).toBe(first.id);
    expect(await db.actorEvent.count({ where: { sourceKey: `test:${suffix}:origin` } })).toBe(1);

    await Promise.all([
      db.$transaction((tx) =>
        appendCanonicalActorEvent(
          tx,
          {
            actorId,
            executionId,
            type: 'test.concurrent',
            sourceKey: `test:${suffix}:concurrent:a`,
            hostId,
            environmentVersion: 'test@1',
            issuer: 'integration-test',
            payload: { branch: 'a' },
          },
          SIGNING_SECRET,
        ),
      ),
      db.$transaction((tx) =>
        appendCanonicalActorEvent(
          tx,
          {
            actorId,
            executionId,
            type: 'test.concurrent',
            sourceKey: `test:${suffix}:concurrent:b`,
            hostId,
            environmentVersion: 'test@1',
            issuer: 'integration-test',
            payload: { branch: 'b' },
          },
          SIGNING_SECRET,
        ),
      ),
    ]);

    const events = await db.actorEvent.findMany({
      where: { actorId },
      orderBy: [{ createdAt: 'asc' }, { observedAt: 'asc' }, { id: 'asc' }],
    });

    expect(events).toHaveLength(3);
    expect(events[0]!.previousEventHash).toBeNull();
    expect(events[1]!.previousEventHash).toBe(events[0]!.hash);
    expect(events[2]!.previousEventHash).toBe(events[1]!.hash);
  });
});
