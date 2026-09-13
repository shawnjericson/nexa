import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam, moveToNewOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const api = {
  get: (token: string, path: string, query: Record<string, string | number> = {}) =>
    request(app).get(`/api/v1${path}`).query(query).set(bearer(token)),
  post: (token: string, path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set(bearer(token)).send(body),
  patch: (token: string, path: string, body: object) =>
    request(app).patch(`/api/v1${path}`).set(bearer(token)).send(body),
  delete: (token: string, path: string) => request(app).delete(`/api/v1${path}`).set(bearer(token)),
};

let sequence = 0;
const send = (token: string, conversationId: string, content: string) =>
  api.post(token, `/conversations/${conversationId}/messages`, {
    content,
    client_message_id: `msg-${Date.now()}-${++sequence}`,
  });

describe('direct conversations', () => {
  it('opens one conversation per pair, from either side', async () => {
    const { alice, bob } = await createTeam(app);

    const first = await api.post(alice.accessToken, '/conversations', {
      type: 'DIRECT',
      user_id: bob.user.id,
    });
    const again = await api.post(alice.accessToken, '/conversations', {
      type: 'DIRECT',
      user_id: bob.user.id,
    });
    const fromBob = await api.post(bob.accessToken, '/conversations', {
      type: 'DIRECT',
      user_id: alice.user.id,
    });

    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      type: 'DIRECT',
      my_role: 'MEMBER',
      member_count: 2,
      direct_peer: { id: bob.user.id },
    });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(fromBob.status).toBe(200);
    expect(fromBob.body.data).toMatchObject({
      id: first.body.data.id,
      direct_peer: { id: alice.user.id },
    });
  });

  it('refuses yourself and people outside the organization', async () => {
    const { alice } = await createTeam(app);
    const outsider = await registerAndLogin(app);
    await moveToNewOrganization(outsider.user.id, 'elsewhere');

    const self = await api.post(alice.accessToken, '/conversations', {
      type: 'DIRECT',
      user_id: alice.user.id,
    });
    const foreign = await api.post(alice.accessToken, '/conversations', {
      type: 'DIRECT',
      user_id: outsider.user.id,
    });

    expect([self.status, self.body.code]).toEqual([400, 'INVALID_DIRECT_PEER']);
    expect([foreign.status, foreign.body.code]).toEqual([404, 'PARTICIPANT_NOT_FOUND']);
  });

  it('stays invisible to non-members, organization owners included (risk register 5.4)', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const dm = (
      await api.post(alice.accessToken, '/conversations', { type: 'DIRECT', user_id: bob.user.id })
    ).body.data;
    await send(alice.accessToken, dm.id, 'private');

    const attempts = [
      await api.get(owner.accessToken, `/conversations/${dm.id}`),
      await api.get(owner.accessToken, `/conversations/${dm.id}/messages`),
      await send(owner.accessToken, dm.id, 'let me in'),
      await api.post(owner.accessToken, `/conversations/${dm.id}/members`, {
        user_ids: [owner.user.id],
      }),
    ];

    for (const res of attempts) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONVERSATION_NOT_FOUND');
    }
  });
});

describe('groups', () => {
  it('belong to their creator and stay hidden from outsiders', async () => {
    const { owner, alice, bob } = await createTeam(app);

    const res = await api.post(alice.accessToken, '/conversations', {
      type: 'GROUP',
      name: 'Dự án NEXA',
      member_ids: [bob.user.id, alice.user.id],
    });
    const asOrgOwner = await api.get(owner.accessToken, `/conversations/${res.body.data.id}`);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'GROUP',
      name: 'Dự án NEXA',
      my_role: 'OWNER',
      member_count: 2,
    });
    const roles = res.body.data.members.map((m: { user: { id: string }; role: string }) => [
      m.user.id,
      m.role,
    ]);
    expect(roles).toEqual(
      expect.arrayContaining([
        [alice.user.id, 'OWNER'],
        [bob.user.id, 'MEMBER'],
      ]),
    );
    expect(asOrgOwner.status).toBe(404);
  });

  it('let owners manage members and anyone leave, handing ownership on', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const group = (
      await api.post(alice.accessToken, '/conversations', {
        type: 'GROUP',
        name: 'Team',
        member_ids: [bob.user.id],
      })
    ).body.data;

    const byMember = await api.post(bob.accessToken, `/conversations/${group.id}/members`, {
      user_ids: [owner.user.id],
    });
    const byOwner = await api.post(alice.accessToken, `/conversations/${group.id}/members`, {
      user_ids: [owner.user.id],
    });
    const aliceLeaves = await api.delete(
      alice.accessToken,
      `/conversations/${group.id}/members/${alice.user.id}`,
    );
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: group.id },
      orderBy: { joinedAt: 'asc' },
    });

    expect([byMember.status, byMember.body.code]).toEqual([
      403,
      'CONVERSATION_MANAGEMENT_FORBIDDEN',
    ]);
    expect(byOwner.body.data.member_count).toBe(3);
    expect(aliceLeaves.status).toBe(200);
    expect(members.map((m) => [m.userId, m.role])).toEqual([
      [bob.user.id, 'OWNER'],
      [owner.user.id, 'MEMBER'],
    ]);
  });
});

describe('channels', () => {
  it('can be browsed and joined by any member, but reading needs joining', async () => {
    const { alice, bob } = await createTeam(app);

    const channel = await api.post(alice.accessToken, '/conversations', {
      type: 'CHANNEL',
      name: 'Thông báo chung',
      description: 'Company news',
    });
    const duplicate = await api.post(bob.accessToken, '/conversations', {
      type: 'CHANNEL',
      name: 'thông báo CHUNG',
    });
    const browse = await api.get(bob.accessToken, '/channels');
    const id = channel.body.data.id;
    const beforeJoin = await api.get(bob.accessToken, `/conversations/${id}/messages`);
    const join = await api.post(bob.accessToken, `/conversations/${id}/members`, {
      user_ids: [bob.user.id],
    });
    const afterJoin = await api.get(bob.accessToken, `/conversations/${id}/messages`);

    expect(channel.body.data).toMatchObject({
      type: 'CHANNEL',
      slug: 'thong-bao-chung',
      my_role: 'OWNER',
    });
    expect([duplicate.status, duplicate.body.code]).toEqual([409, 'CHANNEL_EXISTS']);
    expect(browse.body.data).toEqual([
      expect.objectContaining({ slug: 'thong-bao-chung', joined: false, member_count: 1 }),
    ]);
    expect([beforeJoin.status, beforeJoin.body.code]).toEqual([403, 'JOIN_REQUIRED']);
    expect(join.body.data.member_count).toBe(2);
    expect(afterJoin.status).toBe(200);
  });

  it('stay readable when archived but take no new messages', async () => {
    const { alice } = await createTeam(app);
    const channel = (
      await api.post(alice.accessToken, '/conversations', { type: 'CHANNEL', name: 'Old news' })
    ).body.data;
    await send(alice.accessToken, channel.id, 'before archiving');

    const archived = await api.patch(alice.accessToken, `/conversations/${channel.id}`, {
      archived: true,
    });
    const blocked = await send(alice.accessToken, channel.id, 'after archiving');
    const history = await api.get(alice.accessToken, `/conversations/${channel.id}/messages`);

    expect(archived.body.data.archived).toBe(true);
    expect([blocked.status, blocked.body.code]).toEqual([409, 'CONVERSATION_ARCHIVED']);
    expect(history.body.data.map((m: { content: string }) => m.content)).toEqual([
      'before archiving',
    ]);
  });
});

describe('conversation list', () => {
  it('orders by latest activity with unread counts and the last message', async () => {
    const { alice, bob } = await createTeam(app);
    const dm = (
      await api.post(alice.accessToken, '/conversations', { type: 'DIRECT', user_id: bob.user.id })
    ).body.data;
    const group = (
      await api.post(alice.accessToken, '/conversations', {
        type: 'GROUP',
        name: 'Group',
        member_ids: [bob.user.id],
      })
    ).body.data;
    await send(bob.accessToken, dm.id, 'ping');
    await send(bob.accessToken, dm.id, 'ping again');

    const list = await api.get(alice.accessToken, '/conversations');
    await api.post(alice.accessToken, `/conversations/${dm.id}/read`, { seq: 2 });
    const afterReading = await api.get(alice.accessToken, '/conversations');

    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([dm.id, group.id]);
    expect(list.body.data[0]).toMatchObject({
      unread_count: 2,
      last_message: { content: 'ping again', seq: 2, sender: { id: bob.user.id } },
    });
    expect(list.body.data[1]).toMatchObject({ unread_count: 0, last_message: null });
    expect(afterReading.body.data[0].unread_count).toBe(0);
  });

  it('paginates with a cursor', async () => {
    const { owner, alice, bob } = await createTeam(app);
    await api.post(alice.accessToken, '/conversations', { type: 'DIRECT', user_id: bob.user.id });
    await api.post(alice.accessToken, '/conversations', { type: 'DIRECT', user_id: owner.user.id });
    await api.post(alice.accessToken, '/conversations', {
      type: 'GROUP',
      name: 'G',
      member_ids: [bob.user.id],
    });

    const page1 = await api.get(alice.accessToken, '/conversations', { limit: 2 });
    const page2 = await api.get(alice.accessToken, '/conversations', {
      limit: 2,
      cursor: page1.body.pagination.next_cursor,
    });

    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination.has_next).toBe(true);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.pagination.has_next).toBe(false);
    const ids = [...page1.body.data, ...page2.body.data].map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('leaving the organization', () => {
  it('removes the person from every conversation but keeps their messages (P0)', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const dm = (
      await api.post(alice.accessToken, '/conversations', { type: 'DIRECT', user_id: bob.user.id })
    ).body.data;
    await send(bob.accessToken, dm.id, 'hello');
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'nexa-test' },
    });

    await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${bob.user.id}`)
      .set(bearer(owner.accessToken));
    const bobTries = await api.get(bob.accessToken, `/conversations/${dm.id}/messages`);

    expect(await prisma.conversationMember.count({ where: { userId: bob.user.id } })).toBe(0);
    expect(await prisma.message.count({ where: { conversationId: dm.id } })).toBe(1);
    expect([bobTries.status, bobTries.body.code]).toEqual([403, 'NO_ORGANIZATION']);
  });
});
