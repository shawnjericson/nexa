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
  MONGODB_URI: z.string().optional(),
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
