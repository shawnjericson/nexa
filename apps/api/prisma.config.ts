import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Same convention as src/config/env.ts: .env fills gaps, real environment variables win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
