import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_API_KEY: z.string().min(32).optional(),
  EVENT_SIGNING_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = rawEnvSchema.parse(process.env);

if (parsed.NODE_ENV === 'production' && !parsed.ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY is required in production.');
}

const corsOrigins = parsed.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (parsed.NODE_ENV === 'production' && corsOrigins.length === 0) {
  throw new Error('At least one CORS_ORIGINS entry is required in production.');
}

export const env = {
  ...parsed,
  ADMIN_API_KEY: parsed.ADMIN_API_KEY ?? 'development-admin-key-change-me-00000000',
  CORS_ORIGINS: corsOrigins,
  TRUST_PROXY: parsed.TRUST_PROXY === 'true',
} as const;
