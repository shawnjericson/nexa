import { readFileSync } from 'node:fs';
import { Redis } from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../logger/logger';

/**
 * rediss:// URLs are encrypted. With a CA file the server's (self-signed) certificate is pinned;
 * its CN is the server hostname rather than the IP we dial, so the hostname check is skipped.
 */
export function createRedisClient(url: string, caFile?: string): Redis {
  const tls = url.startsWith('rediss://')
    ? caFile
      ? { ca: readFileSync(caFile, 'utf8'), checkServerIdentity: () => undefined }
      : { rejectUnauthorized: false }
    : undefined;

  const client = new Redis(url, {
    ...(tls && { tls }),
    // The least-privilege ACL user may not run INFO, which ioredis uses for its ready check.
    enableReadyCheck: false,
    maxRetriesPerRequest: 2,
  });
  client.on('error', (err: Error) => logger.warn({ err: err.message }, 'Redis connection error'));
  return client;
}

/**
 * null when REDIS_URL is not set: the API then runs as a single instance, with presence and
 * realtime fan-out kept in process (risk register 16: Redis degraded mode).
 */
export const redis = env.REDIS_URL ? createRedisClient(env.REDIS_URL, env.REDIS_TLS_CA_FILE) : null;

export async function checkRedis(): Promise<void> {
  if (redis) await redis.ping();
}
