import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { NO_PASSWORD } from '../src/modules/identity/domain/user';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const demoApp = () => createApp({ prisma, config: { DEMO_ORG_SLUG: 'demo' } });

async function startDemo(app: ReturnType<typeof createApp>) {
  const res = await request(app).post('/api/v1/auth/demo');
  return res;
}

describe('try the demo', () => {
  it('signs a guest straight into the demo organization, as a plain member', async () => {
    const app = demoApp();
    const res = await startDemo(app);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      user: { email: expect.stringMatching(/@guest\.nexa\.local$/) },
    });

    const organizations = await request(app)
      .get('/api/v1/organizations')
      .set(bearer(res.body.data.access_token));
    expect(organizations.body.data).toEqual([
      expect.objectContaining({ slug: 'demo', role: 'MEMBER' }),
    ]);

    // Somewhere to look around, which is the point.
    const feed = await request(app).get('/api/v1/feed').set(bearer(res.body.data.access_token));
    expect(feed.status).toBe(200);
  });

  it('gives a guest no password anyone could sign in with', async () => {
    const app = demoApp();
    const guest = await startDemo(app);
    const email = guest.body.data.user.email as string;

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toBe(NO_PASSWORD);

    for (const password of [NO_PASSWORD.repeat(6), 'secret123']) {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      expect([login.status, login.body.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    }
  });

  it('never makes a guest the owner, even of an empty demo organization', async () => {
    const app = demoApp();
    const first = await startDemo(app);
    const second = await startDemo(app);

    const roles = await prisma.organizationMember.findMany({
      where: { organization: { slug: 'demo' } },
      select: { role: { select: { key: true } } },
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(roles.map((row) => row.role.key)).toEqual(['MEMBER', 'MEMBER']);
  });

  it('keeps a guest out of the default organization, whatever the sign-up mode', async () => {
    const app = createApp({ prisma, config: { DEMO_ORG_SLUG: 'demo', SIGNUP_MODE: 'open' } });
    const res = await startDemo(app);

    const memberships = await prisma.organizationMember.findMany({
      where: { user: { email: res.body.data.user.email } },
      select: { organization: { select: { slug: true } } },
    });
    expect(memberships.map((row) => row.organization.slug)).toEqual(['demo']);
  });

  it('does not let a guest create workspaces or put files in storage', async () => {
    const app = demoApp();
    const token = (await startDemo(app)).body.data.access_token as string;

    const workspace = await request(app)
      .post('/api/v1/organizations')
      .set(bearer(token))
      .send({ name: 'Mine now' });
    const upload = await request(app)
      .post('/api/v1/files')
      .set(bearer(token))
      .send({ filename: 'a.png', mime_type: 'image/png', size: 100 });

    expect([workspace.status, workspace.body.code]).toEqual([403, 'GUEST_NOT_ALLOWED']);
    expect([upload.status, upload.body.code]).toEqual([403, 'GUEST_NOT_ALLOWED']);
    expect(await prisma.organization.count({ where: { name: 'Mine now' } })).toBe(0);
  });

  it('seats a guest in the conversations already going on, with the latest one unread', async () => {
    const app = demoApp();
    // The first guest opens the demo and starts a channel with two messages in it.
    const host = (await startDemo(app)).body.data.access_token as string;
    const channel = (
      await request(app)
        .post('/api/v1/conversations')
        .set(bearer(host))
        .send({ type: 'CHANNEL', name: 'Chung' })
    ).body.data as { id: string };
    for (const [index, content] of ['Chào cả nhà', 'Họp lúc 3 giờ nhé'].entries()) {
      await request(app)
        .post(`/api/v1/conversations/${channel.id}/messages`)
        .set(bearer(host))
        .send({ content, client_message_id: `demo-message-${index}` })
        .expect(201);
    }

    const visitor = (await startDemo(app)).body.data.access_token as string;
    const inbox = await request(app).get('/api/v1/conversations').set(bearer(visitor));

    expect(inbox.body.data).toEqual([
      expect.objectContaining({
        id: channel.id,
        type: 'CHANNEL',
        last_read_seq: 1,
        unread_count: 1,
      }),
    ]);
  });

  it('is not there at all when no demo organization is configured', async () => {
    const res = await request(createApp({ prisma })).post('/api/v1/auth/demo');
    expect([res.status, res.body.code]).toEqual([404, 'DEMO_UNAVAILABLE']);
    expect(await prisma.user.count()).toBe(0);
  });
});
