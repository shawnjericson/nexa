import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PrismaNotificationRepository } from '../src/modules/notification/infrastructure/prisma-notification.repository';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { nextEvent, startRealtimeServer } from './helpers/realtime';
import { createTeam } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

interface NotificationBody {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  count: number;
  actor: { id: string } | null;
  actors: { id: string }[];
  metadata: Record<string, unknown>;
  read: boolean;
  read_at: string | null;
}

async function createPost(token: string, body: object = { content: 'Hello team' }) {
  const res = await request(app).post('/api/v1/posts').set(bearer(token)).send(body);
  return res.body.data as { id: string };
}

async function comment(
  token: string,
  postId: string,
  body: { content: string; parent_id?: string },
) {
  const res = await request(app)
    .post(`/api/v1/posts/${postId}/comments`)
    .set(bearer(token))
    .send(body);
  return res.body.data as { id: string };
}

const react = (token: string, postId: string, type: string) =>
  request(app).post(`/api/v1/posts/${postId}/reactions`).set(bearer(token)).send({ type });

async function notificationsOf(token: string, query: Record<string, string | number> = {}) {
  const res = await request(app).get('/api/v1/notifications').query(query).set(bearer(token));
  expect(res.status).toBe(200);
  return res.body.data as NotificationBody[];
}

async function unreadCount(token: string) {
  const res = await request(app).get('/api/v1/notifications/unread-count').set(bearer(token));
  return res.body.data.unread_count as number;
}

const markRead = (token: string, id: string) =>
  request(app).patch(`/api/v1/notifications/${id}/read`).set(bearer(token));

async function defaultOrganizationId() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'nexa-test' },
  });
  return organization.id;
}

let sequence = 0;
const sendMessage = (token: string, conversationId: string, content: string, clientId?: string) =>
  request(app)
    .post(`/api/v1/conversations/${conversationId}/messages`)
    .set(bearer(token))
    .send({ content, client_message_id: clientId ?? `n-${Date.now()}-${++sequence}` });

describe('notification rules', () => {
  it('tells authors about comments, coalesced while unread and never about their own (12.3)', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);

    await comment(bob.accessToken, post.id, { content: 'First!' });
    await comment(owner.accessToken, post.id, { content: 'Nice' });
    await comment(bob.accessToken, post.id, { content: 'Again   and\n again' });
    await comment(alice.accessToken, post.id, { content: 'Thanks all' });

    const list = await notificationsOf(alice.accessToken);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'post.commented',
      entity_type: 'post',
      entity_id: post.id,
      count: 3,
      actor: { id: bob.user.id },
      read: false,
      metadata: { post_id: post.id, excerpt: 'Again and again' },
    });
    expect(list[0]?.actors.map((actor) => actor.id)).toEqual([bob.user.id, owner.user.id]);
    expect(list[0]?.metadata).not.toHaveProperty('actor_ids');
    expect(await notificationsOf(bob.accessToken)).toEqual([]);
    expect(await notificationsOf(owner.accessToken)).toEqual([]);
  });

  it('starts a fresh notification once the previous one was read', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    await comment(bob.accessToken, post.id, { content: 'one' });
    const [first] = await notificationsOf(alice.accessToken);
    await markRead(alice.accessToken, first?.id ?? '');

    await comment(owner.accessToken, post.id, { content: 'two' });

    const list = await notificationsOf(alice.accessToken);
    expect(list.map((n) => [n.count, n.read, n.actor?.id])).toEqual([
      [1, false, owner.user.id],
      [1, true, bob.user.id],
    ]);
    expect(await unreadCount(alice.accessToken)).toBe(1);
  });

  it('tells the person replied to, once even when they also wrote the post', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    const bobsComment = await comment(bob.accessToken, post.id, { content: 'root' });
    await comment(owner.accessToken, post.id, {
      content: 'reply to bob',
      parent_id: bobsComment.id,
    });
    const alicesComment = await comment(alice.accessToken, post.id, { content: 'from the author' });
    await comment(bob.accessToken, post.id, {
      content: 'reply to alice',
      parent_id: alicesComment.id,
    });

    const forBob = await notificationsOf(bob.accessToken);
    const forAlice = await notificationsOf(alice.accessToken);

    expect(forBob).toHaveLength(1);
    expect(forBob[0]).toMatchObject({
      type: 'comment.replied',
      entity_type: 'comment',
      entity_id: bobsComment.id,
      count: 1,
      actor: { id: owner.user.id },
      metadata: { post_id: post.id, parent_id: bobsComment.id, excerpt: 'reply to bob' },
    });
    // bob's comment, owner's reply and bob's reply; alice's own comment doesn't count.
    expect(forAlice.map((n) => [n.type, n.count])).toEqual([['post.commented', 3]]);
  });

  it('coalesces reactions, and changing an existing reaction is not news', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);

    await react(bob.accessToken, post.id, 'LIKE');
    await react(owner.accessToken, post.id, 'LOVE');
    await react(owner.accessToken, post.id, 'LOVE');
    await react(bob.accessToken, post.id, 'HAHA');
    await react(alice.accessToken, post.id, 'HAHA');

    const list = await notificationsOf(alice.accessToken);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'post.reacted',
      entity_id: post.id,
      count: 2,
      actor: { id: owner.user.id },
      metadata: { post_id: post.id, reaction: 'LOVE' },
    });
    expect(list[0]?.actors.map((actor) => actor.id)).toEqual([owner.user.id, bob.user.id]);
  });

  it('announces to every active member except the author', async () => {
    const { owner, alice, bob } = await createTeam(app);
    await prisma.organizationMember.updateMany({
      where: { userId: bob.user.id },
      data: { status: 'SUSPENDED' },
    });

    const announcement = await createPost(owner.accessToken, {
      content: 'Company trip on Friday',
      type: 'ANNOUNCEMENT',
    });
    await createPost(owner.accessToken, { content: 'Just a regular post' });

    const forAlice = await notificationsOf(alice.accessToken);
    expect(forAlice).toHaveLength(1);
    expect(forAlice[0]).toMatchObject({
      type: 'announcement.published',
      entity_type: 'post',
      entity_id: announcement.id,
      count: 1,
      actor: { id: owner.user.id },
      metadata: { post_id: announcement.id, excerpt: 'Company trip on Friday' },
    });
    expect(await prisma.notification.count({ where: { recipientId: bob.user.id } })).toBe(0);
    expect(await notificationsOf(owner.accessToken)).toEqual([]);
  });

  it('keeps one notification per conversation, and a resent message is not counted twice', async () => {
    const { alice, bob } = await createTeam(app);
    const dm = (
      await request(app)
        .post('/api/v1/conversations')
        .set(bearer(alice.accessToken))
        .send({ type: 'DIRECT', user_id: bob.user.id })
    ).body.data as { id: string };

    await sendMessage(alice.accessToken, dm.id, 'hi');
    await sendMessage(alice.accessToken, dm.id, 'are you there?', 'retry-me');
    await sendMessage(alice.accessToken, dm.id, 'are you there?', 'retry-me');

    const list = await notificationsOf(bob.accessToken);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'message.received',
      entity_type: 'conversation',
      entity_id: dm.id,
      count: 2,
      actor: { id: alice.user.id },
      metadata: {
        conversation_id: dm.id,
        conversation_type: 'DIRECT',
        seq: 2,
        excerpt: 'are you there?',
      },
    });
    expect(await notificationsOf(alice.accessToken)).toEqual([]);
  });

  it('clears the conversation notification once the messages have been read', async () => {
    const { alice, bob } = await createTeam(app);
    const dm = (
      await request(app)
        .post('/api/v1/conversations')
        .set(bearer(alice.accessToken))
        .send({ type: 'DIRECT', user_id: bob.user.id })
    ).body.data as { id: string };
    await sendMessage(alice.accessToken, dm.id, 'hi');
    await sendMessage(alice.accessToken, dm.id, 'still there?');

    const before = await notificationsOf(bob.accessToken);
    await request(app)
      .post(`/api/v1/conversations/${dm.id}/read`)
      .set(bearer(bob.accessToken))
      .send({ seq: 2 });
    const after = await notificationsOf(bob.accessToken);
    const unread = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(bearer(bob.accessToken));

    expect(before).toMatchObject([{ type: 'message.received', read: false }]);
    // Still in the list, just no longer demanding attention.
    expect(after).toMatchObject([{ type: 'message.received', read: true }]);
    expect(unread.body.data.unread_count).toBe(0);
  });

  it('tells members when their role changes', async () => {
    const { owner, alice } = await createTeam(app);
    const organizationId = await defaultOrganizationId();

    const promoted = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/members/${alice.user.id}`)
      .set(bearer(owner.accessToken))
      .send({ role: 'ADMIN' });

    expect(promoted.status).toBe(200);
    expect(await notificationsOf(alice.accessToken)).toEqual([
      expect.objectContaining({
        type: 'member.role_changed',
        entity_type: 'organization',
        entity_id: organizationId,
        actor: expect.objectContaining({ id: owner.user.id }),
        metadata: { role: 'ADMIN', previous_role: 'MEMBER' },
      }),
    ]);
  });
});

describe('notifications API', () => {
  it("marks notifications read, idempotently, and only the caller's own", async () => {
    const { owner, alice, bob } = await createTeam(app);
    const first = await createPost(alice.accessToken, { content: 'first' });
    const second = await createPost(alice.accessToken, { content: 'second' });
    await comment(bob.accessToken, first.id, { content: 'on first' });
    await comment(owner.accessToken, second.id, { content: 'on second' });
    const [latest, older] = await notificationsOf(alice.accessToken);
    if (!latest || !older) throw new Error('expected two notifications');

    expect(await unreadCount(alice.accessToken)).toBe(2);
    const read = await markRead(alice.accessToken, older.id);
    const readAgain = await markRead(alice.accessToken, older.id);
    const foreign = await markRead(bob.accessToken, latest.id);
    const unknown = await markRead(alice.accessToken, '0190f5a4-0000-7000-8000-000000000000');
    const malformed = await markRead(alice.accessToken, 'not-a-uuid');

    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ id: older.id, read: true });
    expect(readAgain.body.data.read_at).toBe(read.body.data.read_at);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('NOTIFICATION_NOT_FOUND');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(
      (await notificationsOf(alice.accessToken, { unread_only: 'true' })).map((n) => n.id),
    ).toEqual([latest.id]);

    const readAll = await request(app)
      .post('/api/v1/notifications/read-all')
      .set(bearer(alice.accessToken));
    expect(readAll.body.data).toEqual({ marked_read: 1 });
    expect(await unreadCount(alice.accessToken)).toBe(0);
    // Reading doesn't reorder the list.
    expect((await notificationsOf(alice.accessToken)).map((n) => n.id)).toEqual([
      latest.id,
      older.id,
    ]);
  });

  it('pages through notifications, newest activity first', async () => {
    const { alice, bob } = await createTeam(app);
    const posts = [];
    for (const content of ['one', 'two', 'three']) {
      const post = await createPost(alice.accessToken, { content });
      await comment(bob.accessToken, post.id, { content: `on ${content}` });
      posts.push(post);
    }

    const page1 = await request(app)
      .get('/api/v1/notifications')
      .query({ limit: 2 })
      .set(bearer(alice.accessToken));
    const page2 = await request(app)
      .get('/api/v1/notifications')
      .query({ limit: 2, cursor: page1.body.pagination.next_cursor })
      .set(bearer(alice.accessToken));
    const invalid = await request(app)
      .get('/api/v1/notifications')
      .query({ cursor: 'garbage' })
      .set(bearer(alice.accessToken));

    const ids = (res: typeof page1) =>
      (res.body.data as NotificationBody[]).map((n) => n.entity_id);
    expect(ids(page1)).toEqual([posts[2]?.id, posts[1]?.id]);
    expect(page1.body.pagination).toMatchObject({ has_next: true, limit: 2 });
    expect(ids(page2)).toEqual([posts[0]?.id]);
    expect(page2.body.pagination).toMatchObject({ has_next: false, next_cursor: null });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_CURSOR');
  });
});

describe('notification delivery', () => {
  const draft = (recipientId: string, actorId: string) => ({
    recipientId,
    actorId,
    type: 'post.reacted' as const,
    entityType: 'post',
    entityId: '0190f5a4-0000-7000-8000-000000000001',
    groupKey: 'post.reacted:0190f5a4-0000-7000-8000-000000000001',
    metadata: { reaction: 'LIKE' },
  });

  it('applies a redelivered event only once (12.2)', async () => {
    const { alice, bob } = await createTeam(app);
    const organizationId = await defaultOrganizationId();
    const repository = new PrismaNotificationRepository(prisma);

    const first = await repository.deliver('evt_same', organizationId, [
      draft(alice.user.id, bob.user.id),
    ]);
    const second = await repository.deliver('evt_same', organizationId, [
      draft(alice.user.id, bob.user.id),
    ]);

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(
      await prisma.notification.findMany({
        where: { recipientId: alice.user.id },
        select: { count: true },
      }),
    ).toEqual([{ count: 1 }]);
  });

  it('coalesces concurrent events into one notification', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const organizationId = await defaultOrganizationId();
    const repository = new PrismaNotificationRepository(prisma);
    const actors = [bob.user.id, owner.user.id, bob.user.id, owner.user.id, bob.user.id];

    await Promise.all(
      actors.map((actorId, index) =>
        repository.deliver(`evt_concurrent_${index}`, organizationId, [
          draft(alice.user.id, actorId),
        ]),
      ),
    );

    const rows = await prisma.notification.findMany({
      where: { recipientId: alice.user.id },
      select: { count: true, metadata: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(5);
    expect(new Set((rows[0]?.metadata as { actor_ids: string[] }).actor_ids)).toEqual(
      new Set([bob.user.id, owner.user.id]),
    );
  });

  it('pushes notification.created to the recipient in real time', async () => {
    const server = await startRealtimeServer();
    try {
      const { alice, bob } = await createTeam(server.app);
      const socket = await server.connect(alice.accessToken);
      const post = (
        await request(server.app)
          .post('/api/v1/posts')
          .set(bearer(alice.accessToken))
          .send({ content: 'Live' })
      ).body.data as { id: string };
      const pushed = nextEvent<NotificationBody>(socket, 'notification.created');

      await request(server.app)
        .post(`/api/v1/posts/${post.id}/comments`)
        .set(bearer(bob.accessToken))
        .send({ content: 'hey' });

      expect(await pushed).toMatchObject({
        type: 'post.commented',
        entity_id: post.id,
        count: 1,
        actor: { id: bob.user.id },
        read: false,
      });
    } finally {
      await server.close();
    }
  });
});
