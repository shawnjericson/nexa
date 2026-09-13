import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is not set - see apps/api/.env.example');
}
// Integration tests truncate tables: refuse anything but a dedicated *_test database.
if (!/\/[\w-]+_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Test files share one database, so they run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_ENABLED: 'false',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      BCRYPT_ROUNDS: '4',
      REFRESH_REUSE_GRACE_SECONDS: '0',
      DEFAULT_ORG_SLUG: 'nexa-test',
      DEFAULT_ORG_NAME: 'NEXA Test',
      // The app under test runs without Redis (in-process presence and fan-out);
      // presence-store.test.ts exercises the Redis store directly against TEST_REDIS_URL.
      REDIS_URL: '',
      TEST_REDIS_URL: process.env.REDIS_URL ?? '',
      TEST_REDIS_TLS_CA_FILE: process.env.REDIS_TLS_CA_FILE ?? '',
    },
  },
});
