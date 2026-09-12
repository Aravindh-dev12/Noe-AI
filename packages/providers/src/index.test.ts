import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnthropicProvider, MockProvider, OpenAIProvider } from './index.js';

const input = {
  actorId: 'act_nova',
  executionId: 'exec_nova_v1',
  systemContext: 'Choose one action.',
  observation: { round: 1 },
  allowedActions: [{ id: 'stone' }, { id: 'wave' }, { id: 'spark' }],
};

const actionOutputSchema = z.object({ action: z.string() });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MockProvider', () => {
  it('returns a valid deterministic action', async () => {
    const provider = new MockProvider();
    const first = await provider.run(input);
    const second = await provider.run(input);
    const parsed = actionOutputSchema.parse(JSON.parse(first.rawText) as unknown);

    expect(first.rawText).toBe(second.rawText);
    expect(['stone', 'wave', 'spark']).toContain(parsed.action);
  });

  it('returns a structured example when the selected action supplies one', async () => {
    const provider = new MockProvider();
    const result = await provider.run({
      ...input,
      allowedActions: [
        {
          id: 'offer',
          example: { kind: 'offer', allocationToA: [2, 2, 2] },
        },
      ],
    });

    expect(JSON.parse(result.rawText) as unknown).toEqual({
      kind: 'offer',
      allocationToA: [2, 2, 2],
    });
    expect(result.providerMetadata).toMatchObject({ selectedActionId: 'offer' });
  });
});

describe('OpenAIProvider', () => {
  it('extracts text from the raw Responses API output structure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'resp_test',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: '{"action":"stone"}', annotations: [] }],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 4 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await new OpenAIProvider('test-model', 'test-key').run(input);
    expect(result.rawText).toBe('{"action":"stone"}');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
    expect(result.providerMetadata).toEqual({ responseId: 'resp_test' });
  });
});

describe('AnthropicProvider', () => {
  it('extracts text blocks from the Messages API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'msg_test',
            content: [{ type: 'text', text: '{"action":"wave"}' }],
            usage: { input_tokens: 12, output_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await new AnthropicProvider('test-model', 'test-key').run(input);
    expect(result.rawText).toBe('{"action":"wave"}');
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(result.providerMetadata).toEqual({ responseId: 'msg_test' });
  });
});
