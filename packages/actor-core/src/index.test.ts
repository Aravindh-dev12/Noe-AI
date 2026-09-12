import { describe, expect, it } from 'vitest';

import { createActor, createResearchFork, getCanonicalLineageNode, migrateExecution } from './index.js';

describe('actor continuity', () => {
  it('preserves actor id across model migration', () => {
    const original = createActor({
      handle: 'nova',
      displayName: 'Nova',
      provider: 'openai',
      model: 'gpt-test',
      configHash: 'sha256:a',
      now: '2026-01-01T00:00:00.000Z',
    });

    const migrated = migrateExecution(original, {
      provider: 'anthropic',
      model: 'claude-test',
      configHash: 'sha256:b',
      now: '2026-02-01T00:00:00.000Z',
    });

    expect(migrated.actor.id).toBe(original.actor.id);
    expect(migrated.execution.id).not.toBe(original.execution.id);
    expect(migrated.execution.provider).toBe('anthropic');
    expect(getCanonicalLineageNode(migrated.lineage).kind).toBe('migration');
  });

  it('creates a distinct actor for a research fork', () => {
    const original = createActor({
      handle: 'nova',
      displayName: 'Nova',
      provider: 'openai',
      model: 'gpt-test',
      configHash: 'sha256:a',
    });

    const fork = createResearchFork(original, {
      handle: 'nova-lab-a',
      displayName: 'Nova Lab A',
    });

    expect(fork.forkActor.id).not.toBe(original.actor.id);
    expect(fork.forkLineage.kind).toBe('fork');
    expect(fork.forkLineage.parentNodeId).toBe(getCanonicalLineageNode(original.lineage).id);
  });
});
