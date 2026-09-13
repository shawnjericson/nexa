import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam, moveToNewOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

interface Hit {
  id: string;
  snippet?: { text: string; highlights: Array<[number, number]> };
  [key: string]: unknown;
}

async function searchIn(token: string, scope: string, q: string, extra: object = {}) {
  const res = await request(app)
    .get(`/api/v1/search/${scope}`)
    .query({ q, ...extra })
    .set(bearer(token));
  expect(res.status).toBe(200);
  return res.body.data as Hit[];
}

const ids = (hits: Hit[]) => hits.map((hit) => hit.id);

const post = async (token: string, content: string) =>
  (await request(app).post('/api/v1/posts').set(bearer(token)).send({ content })).body.data as {
    id: string;
  };

let sequence = 0;
const say = (token: string, conversationId: string, content: string) =>
  request(app)
    .post(`/api/v1/conversations/${conversationId}/messages`)
    .set(bearer(token))
    .send({ content, client_message_id: `search-${Date.now()}-${++sequence}` });

const conversation = async (token: string, body: object) =>
  (await request(app).post('/api/v1/conversations').set(bearer(token)).send(body)).body.data as {
    id: string;
  };

const rename = (token: string, displayName: string) =>
  request(app).put('/api/v1/users/me').set(bearer(token)).send({ display_name: displayName });

describe('search', () => {
  it('matches posts whatever the accents, case or word endings, with highlighted snippets', async () => {
    const { alice, bob } = await createTeam(app);
    const report = await post(
      alice.accessToken,
      'Báo cáo doanh thu quý 3 đã sẵn sàng. Mọi người xem trước buổi họp nhé!',
    );
    await post(alice.accessToken, 'Lịch nghỉ lễ Quốc khánh 2/9');

    const plain = await searchIn(bob.accessToken, 'posts', 'bao cao');
    const accented = await searchIn(bob.accessToken, 'posts', 'BÁO CÁO');
    const prefixes = await searchIn(bob.accessToken, 'posts', 'doan thu san sang');
    const missing = await searchIn(bob.accessToken, 'posts', 'ngân sách');

    expect(ids(plain)).toEqual([report.id]);
    expect(ids(accented)).toEqual([report.id]);
    expect(ids(prefixes)).toEqual([report.id]);
    expect(missing).toEqual([]);
    const [hit] = plain;
    expect(hit).toMatchObject({ author: { id: alice.user.id }, type: 'GENERAL' });
    expect(hit?.snippet?.highlights.map(([s, e]) => hit.snippet?.text.slice(s, e))).toEqual([
      'Báo',
      'cáo',
    ]);
  });

  it('never shows posts, channels or people of another organization (risk register 14)', async () => {
    const { owner, alice } = await createTeam(app);
    const mallory = await registerAndLogin(app);
    await moveToNewOrganization(mallory.user.id, 'rival-company');
    await rename(alice.accessToken, 'Nguyễn Thị Lan');
    await rename(mallory.accessToken, 'Nguyễn Văn Mạnh');
    const ours = await post(alice.accessToken, 'Kế hoạch tuyển dụng năm sau');
    const theirs = await post(mallory.accessToken, 'Kế hoạch bí mật của đối thủ');
    await conversation(owner.accessToken, { type: 'CHANNEL', name: 'Kế hoạch chung' });
    await conversation(mallory.accessToken, { type: 'CHANNEL', name: 'Kế hoạch riêng' });

    const alicePosts = await searchIn(alice.accessToken, 'posts', 'ke hoach');
    const malloryPosts = await searchIn(mallory.accessToken, 'posts', 'ke hoach');
    const aliceChannels = await searchIn(alice.accessToken, 'conversations', 'ke hoach');
    const people = await searchIn(alice.accessToken, 'people', 'nguyen');

    expect(ids(alicePosts)).toEqual([ours.id]);
    expect(ids(malloryPosts)).toEqual([theirs.id]);
    expect(aliceChannels.map((hit) => hit.name)).toEqual(['Kế hoạch chung']);
    expect(ids(people)).toEqual([alice.user.id]);
  });

  it('finds messages only in conversations the caller is in, admins included (ADR-015)', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const dm = await conversation(alice.accessToken, { type: 'DIRECT', user_id: bob.user.id });
    await say(alice.accessToken, dm.id, 'Mật khẩu wifi phòng họp là nexa2026');
    const channel = await conversation(owner.accessToken, { type: 'CHANNEL', name: 'Marketing' });
    await say(owner.accessToken, channel.id, 'Chiến dịch Tết bắt đầu từ tuần sau');
    const group = await conversation(owner.accessToken, {
      type: 'GROUP',
      name: 'Dự án Alpha',
      member_ids: [bob.user.id],
    });
    await say(owner.accessToken, group.id, 'Alpha release checklist');

    const bobWifi = await searchIn(bob.accessToken, 'messages', 'wifi');
    const ownerWifi = await searchIn(owner.accessToken, 'messages', 'wifi');
    const aliceCampaignBefore = await searchIn(alice.accessToken, 'messages', 'chien dich');
    const aliceChannels = await searchIn(alice.accessToken, 'conversations', 'marketing');
    const aliceGroups = await searchIn(alice.accessToken, 'conversations', 'du an alpha');
    const bobGroups = await searchIn(bob.accessToken, 'conversations', 'du an alpha');
    await request(app)
      .post(`/api/v1/conversations/${channel.id}/members`)
      .set(bearer(alice.accessToken))
      .send({ user_ids: [alice.user.id] });
    const aliceCampaignAfter = await searchIn(alice.accessToken, 'messages', 'chien dich');
    await request(app)
      .delete(`/api/v1/conversations/${group.id}/members/${bob.user.id}`)
      .set(bearer(owner.accessToken));
    const bobAfterRemoval = await searchIn(bob.accessToken, 'messages', 'alpha');

    expect(bobWifi).toHaveLength(1);
    expect(bobWifi[0]).toMatchObject({
      conversation: { id: dm.id, type: 'DIRECT', direct_peer: { id: alice.user.id } },
      sender: { id: alice.user.id },
    });
    expect(ownerWifi).toEqual([]);
    expect(aliceCampaignBefore).toEqual([]);
    expect(aliceChannels).toEqual([
      expect.objectContaining({ id: channel.id, type: 'CHANNEL', joined: false, member_count: 1 }),
    ]);
    expect(aliceGroups).toEqual([]);
    expect(ids(bobGroups)).toEqual([group.id]);
    expect(ids(aliceCampaignAfter)).toHaveLength(1);
    expect(bobAfterRemoval).toEqual([]);
  });

  it('leaves out deleted content and people who are no longer active', async () => {
    const { owner, alice, bob } = await createTeam(app);
    await rename(alice.accessToken, 'Trần Minh Anh');
    await rename(bob.accessToken, 'Trần Quốc Bảo');
    const deleted = await post(alice.accessToken, 'Thông báo nội bộ đã lỗi thời');
    await request(app).delete(`/api/v1/posts/${deleted.id}`).set(bearer(alice.accessToken));
    const dm = await conversation(alice.accessToken, { type: 'DIRECT', user_id: bob.user.id });
    const sent = await say(alice.accessToken, dm.id, 'Tin nhắn gửi nhầm');
    await request(app)
      .delete(`/api/v1/conversations/${dm.id}/messages/${sent.body.data.id}`)
      .set(bearer(alice.accessToken));
    await prisma.organizationMember.updateMany({
      where: { userId: bob.user.id },
      data: { status: 'SUSPENDED' },
    });

    expect(await searchIn(owner.accessToken, 'posts', 'thong bao')).toEqual([]);
    expect(await searchIn(alice.accessToken, 'messages', 'gui nham')).toEqual([]);
    expect(ids(await searchIn(owner.accessToken, 'people', 'tran'))).toEqual([alice.user.id]);

    await prisma.user.update({ where: { id: alice.user.id }, data: { status: 'DEACTIVATED' } });
    expect(await searchIn(owner.accessToken, 'people', 'tran')).toEqual([]);
  });

  it('finds people by username too', async () => {
    const { owner, alice } = await createTeam(app);

    const byUsername = await searchIn(owner.accessToken, 'people', alice.input.username);

    expect(byUsername[0]).toMatchObject({ id: alice.user.id, username: alice.input.username });
    expect(byUsername[0]).not.toHaveProperty('email');
  });

  it('groups the best results of every kind, then pages through one kind', async () => {
    const { owner, alice } = await createTeam(app);
    for (const month of ['một', 'hai', 'ba']) {
      await post(alice.accessToken, `Kế hoạch tháng ${month}`);
    }

    const overview = await request(app)
      .get('/api/v1/search')
      .query({ q: 'ke hoach', limit: 2 })
      .set(bearer(owner.accessToken));
    const page1 = await request(app)
      .get('/api/v1/search/posts')
      .query({ q: 'ke hoach', limit: 2 })
      .set(bearer(owner.accessToken));
    const page2 = await request(app)
      .get('/api/v1/search/posts')
      .query({ q: 'ke hoach', limit: 2, cursor: page1.body.pagination.next_cursor })
      .set(bearer(owner.accessToken));

    expect(overview.status).toBe(200);
    expect(overview.body.data).toMatchObject({
      query: 'ke hoach',
      terms: ['ke', 'hoach'],
      people: { items: [], has_more: false },
      conversations: { items: [], has_more: false },
      messages: { items: [], has_more: false },
    });
    expect(overview.body.data.posts.items).toHaveLength(2);
    expect(overview.body.data.posts.has_more).toBe(true);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination).toMatchObject({ has_next: true, limit: 2 });
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.pagination).toMatchObject({ has_next: false, next_cursor: null });
    expect(new Set([...ids(page1.body.data), ...ids(page2.body.data)]).size).toBe(3);
  });

  it('validates input and is safe against injection', async () => {
    const { owner, alice } = await createTeam(app);
    const kept = await post(alice.accessToken, 'Nội dung quan trọng');
    const get = (path: string, query: object) =>
      request(app).get(path).query(query).set(bearer(owner.accessToken));

    const missing = await get('/api/v1/search', {});
    const tooShort = await get('/api/v1/search', { q: 'a' });
    const unknownScope = await get('/api/v1/search/files', { q: 'report' });
    const badCursor = await get('/api/v1/search/posts', { q: 'noi dung', cursor: 'garbage' });
    const punctuation = await get('/api/v1/search/posts', { q: '!!!' });
    const injection = await get('/api/v1/search/posts', {
      q: "noi'); DROP TABLE posts; -- & | ! :*",
    });

    expect(missing.status).toBe(400);
    expect(tooShort.status).toBe(400);
    expect(unknownScope.status).toBe(400);
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');
    expect(punctuation.body.data).toEqual([]);
    expect(injection.status).toBe(200);
    expect(await prisma.post.count({ where: { id: kept.id } })).toBe(1);
  });
});
