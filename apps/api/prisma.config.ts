import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Same convention as src/config/env.ts: .env fills gaps, real environment variables win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/**
 * The Prisma CLI (migrations) uses its own engine, which takes TLS settings from the URL.
 * accept_invalid_certs keeps the connection encrypted with the server's self-signed certificate;
 * the application itself pins that certificate (src/infrastructure/database/prisma.ts).
 */
function withSsl(url: string | undefined): string | undefined {
  if (!url || process.env.DATABASE_SSL !== 'true') return url;
  const parsed = new URL(url);
  parsed.searchParams.set('sslmode', 'require');
  parsed.searchParams.set('sslaccept', 'accept_invalid_certs');
  return parsed.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: withSsl(process.env.DATABASE_URL) ?? '',
    shadowDatabaseUrl: withSsl(process.env.SHADOW_DATABASE_URL),
  },
});
