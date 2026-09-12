import { execSync } from 'node:child_process';

/** Brings the test database schema up to date once, before any test file runs. */
export default function setup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
