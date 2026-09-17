import type { PresenceStore } from '../domain/ports';

/**
 * Presence for a single API instance, used when Redis is not configured (risk register 16) and in
 * tests. Same semantics as the Redis store: connections expire unless heartbeats extend them.
 */
export class MemoryPresenceStore implements PresenceStore {
  private readonly connections = new Map<string, Map<string, number>>();

  constructor(private readonly clock: () => number = Date.now) {}

  async connect(organizationId: string, userId: string, connectionId: string, ttlMs: number) {
    const key = `${organizationId}:${userId}`;
    const wasOnline = this.live(key) !== undefined;
    const connections = this.connections.get(key) ?? new Map<string, number>();
    connections.set(connectionId, this.clock() + ttlMs);
    this.connections.set(key, connections);
    return !wasOnline;
  }

  async heartbeat(organizationId: string, userId: string, connectionId: string, ttlMs: number) {
    await this.connect(organizationId, userId, connectionId, ttlMs);
  }

  async disconnect(organizationId: string, userId: string, connectionId: string) {
    const key = `${organizationId}:${userId}`;
    this.connections.get(key)?.delete(connectionId);
    return this.live(key) === undefined;
  }

  async onlineUserIds(organizationId: string, userIds: readonly string[]) {
    return new Set(userIds.filter((userId) => this.live(`${organizationId}:${userId}`)));
  }

  async countOnline(organizationId: string, exceptUserId?: string) {
    let count = 0;
    for (const key of [...this.connections.keys()]) {
      const [org, userId] = key.split(':');
      if (org === organizationId && userId !== exceptUserId && this.live(key)) count += 1;
    }
    return count;
  }

  /** The user's unexpired connections, or undefined when there are none. */
  private live(key: string): Map<string, number> | undefined {
    const connections = this.connections.get(key);
    if (!connections) return undefined;
    const now = this.clock();
    for (const [connectionId, expiresAt] of connections) {
      if (expiresAt <= now) connections.delete(connectionId);
    }
    if (connections.size === 0) {
      this.connections.delete(key);
      return undefined;
    }
    return connections;
  }
}
