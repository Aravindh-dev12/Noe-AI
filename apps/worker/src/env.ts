import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  EVENT_SIGNING_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MODEL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  MAX_MODEL_TOKENS: z.coerce.number().int().positive().max(16_384).default(2_048),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
});

export const env = envSchema.parse(process.env);
