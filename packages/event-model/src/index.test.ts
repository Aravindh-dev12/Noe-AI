import { describe, expect, it } from 'vitest';

import { assertEventChain, createActorEvent, verifyEventHash } from './index.js';

const base = {
  actorId: 'act_demo',
  type: 'competition.result',
  occurredAt: '2026-01-01T00:00:00.000Z',
  observedAt: '2026-01-01T00:00:01.000Z',
  hostId: 'host_demo',
  environmentVersion: 'triad@1.0.0',
  payload: { result: 'win' },
  provenance: { issuer: 'host_demo' },
  canonicalStatus: 'accepted' as const,
};

describe('canonical events', () => {
  it('hashes deterministically', () => {
    const event = createActorEvent({ id: 'evt_1', ...base });
    expect(verifyEventHash(event)).toBe(true);

    const reordered = createActorEvent({
      id: 'evt_1',
      ...base,
      payload: { z: 1, a: 2 },
    });
    const reorderedAgain = createActorEvent({
      id: 'evt_1',
      ...base,
      payload: { a: 2, z: 1 },
    });

    expect(reordered.hash).toBe(reorderedAgain.hash);
  });

  it('binds the semantic source key into the event hash', () => {
    const first = createActorEvent({
      id: 'evt_source',
      ...base,
      sourceKey: 'match:1:actor:a:result',
    });
    const second = createActorEvent({
      id: 'evt_source',
      ...base,
      sourceKey: 'match:2:actor:a:result',
    });

    expect(first.hash).not.toBe(second.hash);
    expect(verifyEventHash(first)).toBe(true);
    expect(verifyEventHash(second)).toBe(true);
  });

  it('validates a linked event chain', () => {
    const first = createActorEvent({ id: 'evt_1', ...base });
    const second = createActorEvent({
      id: 'evt_2',
      ...base,
      type: 'actor.execution.migrated',
      provenance: {
        issuer: 'host_demo',
        previousEventHash: first.hash,
      },
    });

    expect(() => assertEventChain([first, second])).not.toThrow();
  });
});
