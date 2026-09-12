import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { addMember, createOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function getFeed(token: string, organizationId?: string) {
  const req = request(app).get('/api/v1/feed').set(bearer(token));
  return organizationId ? req.set('X-Organization-Id', organizationId) : req;
}

describe('organization context', () => {
  it('uses the only membership when no organization is specified', async () => {
    const session = await registerAndLogin(app);

    const res = await getFeed(session.accessToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [],
      pagination: { next_cursor: null, has_next: false, limit: 20 },
    });
  });

  it('asks for X-Organization-Id when the user belongs to several organizations', async () => {
    const session = await registerAndLogin(app);
    const second = await createOrganization('second-company');
    await addMember(second.id, session.user.id);

    const ambiguous = await getFeed(session.accessToken);
    const explicit = await getFeed(session.accessToken, second.id);

    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
    expect(explicit.status).toBe(200);
  });

  it('refuses organizations the user does not belong to, whether they exist or not', async () => {
    const session = await registerAndLogin(app);
    const foreign = await createOrganization('foreign-company');

    for (const organizationId of [foreign.id, '0190f5a4-0000-7000-8000-000000000000']) {
      const res = await getFeed(session.accessToken, organizationId);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_A_MEMBER');
    }
  });

  it('rejects a malformed X-Organization-Id', async () => {
    const session = await registerAndLogin(app);

    const res = await getFeed(session.accessToken, 'not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ORGANIZATION_ID');
  });

  it('blocks suspended members', async () => {
    const session = await registerAndLogin(app);
    await prisma.organizationMember.updateMany({
      where: { userId: session.user.id },
      data: { status: 'SUSPENDED' },
    });

    const res = await getFeed(session.accessToken);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBERSHIP_SUSPENDED');
  });

  it('cuts off a removed member immediately, although their token is still valid', async () => {
    const session = await registerAndLogin(app);
    expect((await getFeed(session.accessToken)).status).toBe(200);

    await prisma.organizationMember.deleteMany({ where: { userId: session.user.id } });
    const res = await getFeed(session.accessToken);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_ORGANIZATION');
  });

  it('authenticates before resolving the organization', async () => {
    const res = await request(app).get('/api/v1/feed');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
