import { describe, expect, it } from 'vitest';

import { MockProvider } from './index.js';

describe('MockProvider', () => {
  it('returns a valid deterministic action', async () => {
    const provider = new MockProvider();
    const input = {
      actorId: 'act_nova',
      executionId: 'exec_nova_v1',
      systemContext: 'Choose one action.',
      observation: { round: 1 },
      allowedActions: [{ id: 'stone' }, { id: 'wave' }, { id: 'spark' }],
    };

    const first = await provider.run(input);
    const second = await provider.run(input);

    expect(first.rawText).toBe(second.rawText);
    expect(['stone', 'wave', 'spark']).toContain(JSON.parse(first.rawText).action);
  });
});
