import type { Redis } from 'ioredis';
import type { PresenceStore } from '../domain/ports';

/**
 * One sorted set per user and organization: members are connection ids, scores their expiry.
 * Heartbeats push the expiry forward; a sleeping laptop simply expires (risk register 11.2), and
 * the key itself expires when no connection is left.
 *
 * And one per organization of the people online, scored by their latest expiry, so "N online"
 * is one ZCOUNT rather than a lookup per member.
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
      .zadd(this.onlineKey(organizationId), 'GT', now + ttlMs, userId)
      .pexpire(this.onlineKey(organizationId), ttlMs)
      .exec();
    return Number(results?.[1]?.[1] ?? 0) === 0;
  }

  async heartbeat(organizationId: string, userId: string, connectionId: string, ttlMs: number) {
    const key = this.key(organizationId, userId);
    const expiresAt = this.clock() + ttlMs;
    await this.redis
      .multi()
      .zadd(key, expiresAt, connectionId)
      .pexpire(key, ttlMs)
      .zadd(this.onlineKey(organizationId), 'GT', expiresAt, userId)
      .pexpire(this.onlineKey(organizationId), ttlMs)
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
    const offline = Number(results?.[2]?.[1] ?? 0) === 0;
    if (offline) await this.redis.zrem(this.onlineKey(organizationId), userId);
    return offline;
  }

  async onlineUserIds(organizationId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return new Set<string>();
    const now = this.clock();
    const pipeline = this.redis.pipeline();
    for (const userId of userIds) pipeline.zcount(this.key(organizationId, userId), now, '+inf');
    const results = await pipeline.exec();
    return new Set(userIds.filter((_, index) => Number(results?.[index]?.[1] ?? 0) > 0));
  }

  async countOnline(organizationId: string, exceptUserId?: string) {
    const key = this.onlineKey(organizationId);
    const now = this.clock();
    const results = await this.redis
      .multi()
      .zremrangebyscore(key, '-inf', now)
      .zcard(key)
      .zscore(key, exceptUserId ?? '')
      .exec();
    const count = Number(results?.[1]?.[1] ?? 0);
    const except = results?.[2]?.[1];
    return count - (exceptUserId && except !== null && except !== undefined ? 1 : 0);
  }

  private onlineKey(organizationId: string): string {
    return `${this.prefix}online:${organizationId}`;
  }

  private key(organizationId: string, userId: string): string {
    return `${this.prefix}${organizationId}:${userId}`;
  }
}
