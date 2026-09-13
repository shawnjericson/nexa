import type { Redis } from 'ioredis';
import type { PresenceStore } from '../domain/ports';

/**
 * One sorted set per user and organization: members are connection ids, scores their expiry.
 * Heartbeats push the expiry forward; a sleeping laptop simply expires (risk register 11.2), and
 * the key itself expires when no connection is left.
 */
export class RedisPresenceStore implements PresenceStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'nexa:presence:',
    private readonly clock: () => number = Date.now,
  ) {}

  async connect(organizationId: string, userId: string, connectionId: string, ttlMs: number) {
    const key = this.key(organizationId, userId);
    const now = this.clock();
    const results = await this.redis
      .multi()
      .zremrangebyscore(key, '-inf', now)
      .zcard(key)
      .zadd(key, now + ttlMs, connectionId)
      .pexpire(key, ttlMs)
      .exec();
    return Number(results?.[1]?.[1] ?? 0) === 0;
  }

  async heartbeat(organizationId: string, userId: string, connectionId: string, ttlMs: number) {
    const key = this.key(organizationId, userId);
    await this.redis
      .multi()
      .zadd(key, this.clock() + ttlMs, connectionId)
      .pexpire(key, ttlMs)
      .exec();
  }

  async disconnect(organizationId: string, userId: string, connectionId: string) {
    const key = this.key(organizationId, userId);
    const results = await this.redis
      .multi()
      .zrem(key, connectionId)
      .zremrangebyscore(key, '-inf', this.clock())
      .zcard(key)
      .exec();
    return Number(results?.[2]?.[1] ?? 0) === 0;
  }

  async onlineUserIds(organizationId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return new Set<string>();
    const now = this.clock();
    const pipeline = this.redis.pipeline();
    for (const userId of userIds) pipeline.zcount(this.key(organizationId, userId), now, '+inf');
    const results = await pipeline.exec();
    return new Set(userIds.filter((_, index) => Number(results?.[index]?.[1] ?? 0) > 0));
  }

  private key(organizationId: string, userId: string): string {
    return `${this.prefix}${organizationId}:${userId}`;
  }
}
