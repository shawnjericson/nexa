import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local runs read apps/api/.env; variables already set in the real environment win.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: csv.default(['http://localhost:3000']),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: bool.default(true),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: bool.default(false),
  // PEM file of the server certificate to pin; without it the connection is encrypted but unverified.
  DATABASE_SSL_CA_FILE: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  MONGODB_AUDIT_COLLECTION: z
    .string()
    .regex(/^[A-Za-z0-9_]+$/)
    .default('audit_logs'),
  // Without Redis the API still runs on one instance: presence, realtime fan-out and rate
  // limits fall back to in-process state (risk register 16: Redis degraded mode).
  REDIS_URL: z.string().optional(),
  // PEM file of the server certificate to pin for rediss:// connections.
  REDIS_TLS_CA_FILE: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // A rotated refresh token presented again within this window (e.g. two tabs refreshing at once)
  // is rejected without revoking the session; later reuse is treated as theft.
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  DEFAULT_ORG_SLUG: z.string().min(1).default('nexa'),
  DEFAULT_ORG_NAME: z.string().min(1).default('NEXA'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
