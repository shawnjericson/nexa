import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
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

  it('is not there at all when no demo organization is configured', async () => {
    const res = await request(createApp({ prisma })).post('/api/v1/auth/demo');
    expect([res.status, res.body.code]).toEqual([404, 'DEMO_UNAVAILABLE']);
    expect(await prisma.user.count()).toBe(0);
  });
});
