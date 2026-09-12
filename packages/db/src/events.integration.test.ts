import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

const SIGNING_SECRET = 'test-event-signing-secret-that-is-long-enough';
const suffix = randomUUID();
const actorId = `act_test_${suffix}`;
const executionId = `exec_test_${suffix}`;
const lineageId = `lin_test_${suffix}`;
const hostId = `host_test_${suffix}`;

beforeAll(async () => {
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
});

afterAll(async () => {
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('canonical actor persistence', () => {
  it('deduplicates retries and serializes concurrent appends into one monotonic chain', async () => {
    const sourceKey = `test:${suffix}:origin`;
    const eventInput = {
      actorId,
      executionId,
      type: 'test.origin',
      sourceKey,
      hostId,
      environmentVersion: 'test@1',
      issuer: 'integration-test',
      payload: { step: 1 },
    } as const;

    const first = await db.$transaction((tx) =>
      appendCanonicalActorEvent(tx, eventInput, SIGNING_SECRET),
    );
    const retry = await db.$transaction((tx) =>
      appendCanonicalActorEvent(tx, eventInput, SIGNING_SECRET),
    );

    expect(retry.id).toBe(first.id);
    expect(retry.sequence).toBe(1);
    expect(await db.actorEvent.count({ where: { sourceKey } })).toBe(1);

    await expect(
      db.$transaction((tx) =>
        appendCanonicalActorEvent(
          tx,
          {
            ...eventInput,
            payload: { step: 999 },
          },
          SIGNING_SECRET,
        ),
      ),
    ).rejects.toThrow(/conflicting canonical data/);

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
      orderBy: { sequence: 'asc' },
    });

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(events[0]!.previousEventHash).toBeNull();
    expect(events[1]!.previousEventHash).toBe(events[0]!.hash);
    expect(events[2]!.previousEventHash).toBe(events[1]!.hash);
  });

  it('enforces unique event sequence positions per actor at the database layer', async () => {
    const existing = await db.actorEvent.findFirstOrThrow({
      where: { actorId },
      orderBy: { sequence: 'asc' },
    });

    await expect(
      db.actorEvent.create({
        data: {
          id: `evt_duplicate_sequence_${suffix}`,
          actorId,
          sequence: existing.sequence,
          executionId,
          hostId,
          type: 'test.duplicate-sequence',
          occurredAt: new Date(),
          observedAt: new Date(),
          environmentVersion: 'test@1',
          payload: {},
          issuer: 'integration-test',
          hash: `sha256:${'a'.repeat(64)}`,
          canonicalStatus: 'ACCEPTED',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces exactly one active execution per actor at the database layer', async () => {
    await expect(
      db.actorExecution.create({
        data: {
          id: `exec_second_active_${suffix}`,
          actorId,
          provider: 'mock',
          model: 'second-active-model',
          configHash: `test:${suffix}:second-active`,
          startedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    const historical = await db.actorExecution.create({
      data: {
        id: `exec_historical_${suffix}`,
        actorId,
        provider: 'mock',
        model: 'historical-model',
        configHash: `test:${suffix}:historical`,
        startedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
      },
    });

    expect(historical.endedAt).not.toBeNull();
  });

  it('enforces exactly one canonical lineage node per actor at the database layer', async () => {
    await expect(
      db.lineageNode.create({
        data: {
          id: `lin_second_canonical_${suffix}`,
          actorId,
          parentNodeId: lineageId,
          kind: 'MIGRATION',
          canonical: true,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    const researchFork = await db.lineageNode.create({
      data: {
        id: `lin_noncanonical_${suffix}`,
        actorId,
        parentNodeId: lineageId,
        kind: 'FORK',
        canonical: false,
        createdAt: new Date(),
      },
    });

    expect(researchFork.canonical).toBe(false);
  });
});
