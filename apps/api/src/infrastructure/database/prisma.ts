import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../config/env';
import { PrismaClient } from '../../generated/prisma/client';

function sslOptions(): ConnectionOptions | false {
  if (!env.DATABASE_SSL) return false;
  if (!env.DATABASE_SSL_CA_FILE) return { rejectUnauthorized: false };
  // Pin the server's self-signed certificate. Its CN is the server hostname, not the IP we dial,
  // so the hostname check is skipped: trust comes from the pinned certificate itself.
  return {
    ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8'),
    checkServerIdentity: () => undefined,
  };
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, ssl: sslOptions() });

export const prisma = new PrismaClient({ adapter });

export async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
