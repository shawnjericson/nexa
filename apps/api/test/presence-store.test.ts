import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createRedisClient } from '../src/infrastructure/redis/redis';
import type { PresenceStore } from '../src/modules/communication/domain/ports';
import { MemoryPresenceStore } from '../src/modules/communication/infrastructure/memory-presence.store';
import { RedisPresenceStore } from '../src/modules/communication/infrastructure/redis-presence.store';
import { sleep } from './helpers/realtime';

const ORG = 'org-1';

/** Behaviour both implementations must share. */
async function expectMultiDevicePresence(store: PresenceStore, user: string) {
  expect(await store.connect(ORG, user, 'phone', 60_000)).toBe(true);
  expect(await store.connect(ORG, user, 'laptop', 60_000)).toBe(false);
  expect(await store.disconnect(ORG, user, 'phone')).toBe(false);
  expect(await store.onlineUserIds(ORG, [user, 'someone-else'])).toEqual(new Set([user]));
  expect(await store.onlineUserIds('other-org', [user])).toEqual(new Set());
  expect(await store.disconnect(ORG, user, 'laptop')).toBe(true);
  expect(await store.onlineUserIds(ORG, [user])).toEqual(new Set());
}

describe('memory presence store', () => {
  it('stays online while any connection is alive (9.5)', async () => {
    await expectMultiDevicePresence(new MemoryPresenceStore(), 'u1');
  });

  it('expires connections that stop sending heartbeats (11.1)', async () => {
    let now = 1_000;
    const store = new MemoryPresenceStore(() => now);
    await store.connect(ORG, 'u1', 'c1', 5_000);

    now += 4_000;
    await store.heartbeat(ORG, 'u1', 'c1', 5_000);
    now += 4_000;
    const afterHeartbeat = await store.onlineUserIds(ORG, ['u1']);
    now += 2_000;

    expect(afterHeartbeat).toEqual(new Set(['u1']));
    expect(await store.onlineUserIds(ORG, ['u1'])).toEqual(new Set());
  });
});

const redisUrl = process.env.TEST_REDIS_URL;

describe.skipIf(!redisUrl)('redis presence store (VPS Redis)', () => {
  const redis = createRedisClient(redisUrl ?? '', process.env.TEST_REDIS_TLS_CA_FILE || undefined);
  const prefix = `nexa:test:${randomUUID()}:`;
  const store = new RedisPresenceStore(redis, prefix);

  afterAll(async () => {
    await redis.del(`${prefix}${ORG}:u1`, `${prefix}${ORG}:u2`);
    await redis.quit();
  });

  it('stays online while any connection is alive (9.5)', async () => {
    await expectMultiDevicePresence(store, 'u1');
  });

  // Redis ACL matches PSUBSCRIBE patterns literally: `&nexa:*` alone does not allow the pattern
  // the Socket.IO adapter subscribes to (ADR-015).
  it('lets the ACL user subscribe to the Socket.IO adapter channel pattern', async () => {
    const subscriber = redis.duplicate();
    try {
      await expect(subscriber.psubscribe('nexa:socket.io#/#*')).resolves.toBe(1);
    } finally {
      subscriber.disconnect();
    }
  });

  it('expires connections that stop sending heartbeats (11.1)', async () => {
    await store.connect(ORG, 'u2', 'c1', 800);
    const right = await store.onlineUserIds(ORG, ['u2']);
    await sleep(1_200);

    expect(right).toEqual(new Set(['u2']));
    expect(await store.onlineUserIds(ORG, ['u2'])).toEqual(new Set());
  });
});
