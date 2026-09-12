import { createHash } from 'node:crypto';
import { z } from 'zod';

export type ProviderRunInput = {
  actorId: string;
  executionId: string;
  systemContext: string;
  observation: unknown;
  allowedActions: unknown;
  timeoutMs?: number;
  maxTokens?: number;
};

export type ProviderRunResult = {
  rawText: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export interface ModelProvider {
  readonly providerId: string;
  readonly model: string;
  run(input: ProviderRunInput): Promise<ProviderRunResult>;
}

export type ProviderFactoryInput = {
  provider: string;
  model: string;
  apiKey?: string;
};

const openAIResponseSchema = z.object({
  id: z.string().optional(),
  output_text: z.string().optional(),
  output: z.array(z.unknown()).optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
});

const anthropicResponseSchema = z.object({
  id: z.string().optional(),
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
});

function buildUsage(inputTokens?: number, outputTokens?: number): ProviderRunResult['usage'] {
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}

function buildUserPrompt(input: ProviderRunInput): string {
  return [
    'Observation:',
    JSON.stringify(input.observation),
    '',
    'Allowed actions:',
    JSON.stringify(input.allowedActions),
    '',
    'Return exactly one valid JSON action and no markdown.',
  ].join('\n');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class OpenAIProvider implements ModelProvider {
  readonly providerId = 'openai';

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async run(input: ProviderRunInput): Promise<ProviderRunResult> {
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          instructions: input.systemContext,
          input: buildUserPrompt(input),
          max_output_tokens: input.maxTokens ?? 2048,
        }),
      },
      input.timeoutMs ?? 45_000,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 1_000)}`);
    }

    const parsed = openAIResponseSchema.parse(await response.json());
    if (!parsed.output_text) {
      throw new Error('OpenAI response did not contain output_text.');
    }

    const usage = buildUsage(parsed.usage?.input_tokens, parsed.usage?.output_tokens);
    return {
      rawText: parsed.output_text,
      ...(usage ? { usage } : {}),
      providerMetadata: parsed.id ? { responseId: parsed.id } : {},
    };
  }
}

export class AnthropicProvider implements ModelProvider {
  readonly providerId = 'anthropic';

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async run(input: ProviderRunInput): Promise<ProviderRunResult> {
    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          system: input.systemContext,
          max_tokens: input.maxTokens ?? 2048,
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        }),
      },
      input.timeoutMs ?? 45_000,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic request failed (${response.status}): ${body.slice(0, 1_000)}`);
    }

    const parsed = anthropicResponseSchema.parse(await response.json());
    const rawText = parsed.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n')
      .trim();

    if (!rawText) {
      throw new Error('Anthropic response did not contain text content.');
    }

    const usage = buildUsage(parsed.usage?.input_tokens, parsed.usage?.output_tokens);
    return {
      rawText,
      ...(usage ? { usage } : {}),
      providerMetadata: parsed.id ? { responseId: parsed.id } : {},
    };
  }
}

export class MockProvider implements ModelProvider {
  readonly providerId = 'mock';

  constructor(readonly model = 'deterministic-mock-v1') {}

  async run(input: ProviderRunInput): Promise<ProviderRunResult> {
    const actions = z.array(z.object({ id: z.string() })).parse(input.allowedActions);
    if (actions.length === 0) {
      throw new Error('MockProvider requires at least one allowed action.');
    }

    const digest = createHash('sha256')
      .update(`${input.actorId}:${input.executionId}:${JSON.stringify(input.observation)}`)
      .digest();
    const selected = actions[digest[0]! % actions.length]!;

    return {
      rawText: JSON.stringify({ action: selected.id }),
      usage: { inputTokens: 0, outputTokens: 0 },
      providerMetadata: { deterministic: true },
    };
  }
}

export function createProvider(input: ProviderFactoryInput): ModelProvider {
  switch (input.provider) {
    case 'openai':
      if (!input.apiKey) throw new Error('OPENAI_API_KEY is required.');
      return new OpenAIProvider(input.model, input.apiKey);
    case 'anthropic':
      if (!input.apiKey) throw new Error('ANTHROPIC_API_KEY is required.');
      return new AnthropicProvider(input.model, input.apiKey);
    case 'mock':
      return new MockProvider(input.model);
    default:
      throw new Error(`Unsupported provider: ${input.provider}`);
  }
}
