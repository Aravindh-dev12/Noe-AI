import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_API_KEY: z.string().min(32).optional(),
  EVENT_SIGNING_SECRET: z.string().min(32),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('false'),
  USER_MODEL_ALLOWLIST: z.string().default('mock:nova-seed-v1,mock:echo-seed-v1'),
  MAX_USER_ACTORS: z.coerce.number().int().min(1).max(100).default(10),
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

function parseTrustProxy(value: string): boolean | string {
  const normalized = value.trim();
  if (normalized === '' || normalized === 'false') return false;

  if (normalized === 'true') {
    if (parsed.NODE_ENV === 'production') {
      throw new Error(
        'TRUST_PROXY=true is unsafe in production. Configure the exact reverse-proxy IP/CIDR list instead.',
      );
    }
    return true;
  }

  const entries = normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) return false;
  return entries.join(',');
}

const userModels = parsed.USER_MODEL_ALLOWLIST.split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const separator = entry.indexOf(':');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error(`Invalid USER_MODEL_ALLOWLIST entry: ${entry}`);
    }
    return {
      provider: entry.slice(0, separator),
      model: entry.slice(separator + 1),
    } as const;
  });

if (userModels.length === 0) {
  throw new Error('USER_MODEL_ALLOWLIST must contain at least one provider:model pair.');
}

export const env = {
  ...parsed,
  ADMIN_API_KEY: parsed.ADMIN_API_KEY ?? 'development-admin-key-change-me-00000000',
  CORS_ORIGINS: corsOrigins,
  TRUST_PROXY: parseTrustProxy(parsed.TRUST_PROXY),
  USER_MODELS: userModels,
} as const;
