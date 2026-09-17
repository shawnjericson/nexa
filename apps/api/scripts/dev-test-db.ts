/**
 * Runs the API against the test database for UI checks (`pnpm --filter @nexa/api dev:qa`), so
 * trying the web app never creates throwaway accounts in the development database - where the
 * first registrant becomes the default organization's OWNER. Audit logging is off, and uploads
 * go to the test bucket.
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !/\/[\w-]+_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.MONGODB_URI = '';
process.env.S3_BUCKET = process.env.TEST_S3_BUCKET ?? '';
// The web app may run on 3001 when another app already uses 3000.
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';
// So the landing page's "try the demo" works here too (seed it with scripts/seed-demo.ts).
process.env.DEMO_ORG_SLUG ??= 'demo';

await import('../src/server');
