import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createOrganization, createTeam } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const orgPath = (id: string, suffix = '') => `/api/v1/organizations/${id}${suffix}`;

async function defaultOrganizationId() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'nexa-test' },
  });
  return organization.id;
}

const patchMember = (token: string, orgId: string, userId: string, body: object) =>
  request(app)
    .patch(orgPath(orgId, `/members/${userId}`))
    .set(bearer(token))
    .send(body);

const removeMember = (token: string, orgId: string, userId: string) =>
  request(app)
    .delete(orgPath(orgId, `/members/${userId}`))
    .set(bearer(token));

const getFeed = (token: string) => request(app).get('/api/v1/feed').set(bearer(token));

describe('organizations', () => {
  it("lists the caller's organizations with their role", async () => {
    const { owner, alice } = await createTeam(app);

    const asOwner = await request(app).get('/api/v1/organizations').set(bearer(owner.accessToken));
    const asAlice = await request(app).get('/api/v1/organizations').set(bearer(alice.accessToken));

    expect(asOwner.body.data).toEqual([
      expect.objectContaining({ slug: 'nexa-test', role: 'OWNER', membership_status: 'ACTIVE' }),
    ]);
    expect(asAlice.body.data[0].role).toBe('MEMBER');
  });

  it('creates an organization owned by its creator, with a slug derived from the name', async () => {
    const { alice } = await createTeam(app);

    const res = await request(app)
      .post('/api/v1/organizations')
      .set(bearer(alice.accessToken))
      .send({ name: 'Công ty Ánh Dương' });
    const duplicate = await request(app)
      .post('/api/v1/organizations')
      .set(bearer(alice.accessToken))
      .send({ name: 'Another', slug: 'cong-ty-anh-duong' });
    const mine = await request(app).get('/api/v1/organizations').set(bearer(alice.accessToken));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Công ty Ánh Dương',
      slug: 'cong-ty-anh-duong',
      timezone: 'Asia/Ho_Chi_Minh',
      role: 'OWNER',
    });
    const roles = await prisma.role.findMany({ where: { organizationId: res.body.data.id } });
    expect(roles.map((role) => role.key).sort()).toEqual(['ADMIN', 'MANAGER', 'MEMBER', 'OWNER']);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('ORGANIZATION_SLUG_TAKEN');
    expect(mine.body.data).toHaveLength(2);
  });

  it('shows organization details to members only', async () => {
    const { owner } = await createTeam(app);
    const foreign = await createOrganization('foreign-company');

    const own = await request(app)
      .get(orgPath(await defaultOrganizationId()))
      .set(bearer(owner.accessToken));
    const other = await request(app).get(orgPath(foreign.id)).set(bearer(owner.accessToken));

    expect(own.body.data).toMatchObject({ slug: 'nexa-test', member_count: 3, my_role: 'OWNER' });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('NOT_A_MEMBER');
  });

  it('lets only organization.update holders edit the organization', async () => {
    const { owner, alice } = await createTeam(app);
    const id = await defaultOrganizationId();

    const byMember = await request(app)
      .put(orgPath(id))
      .set(bearer(alice.accessToken))
      .send({ name: 'Hijacked' });
    const byOwner = await request(app)
      .put(orgPath(id))
      .set(bearer(owner.accessToken))
      .send({ name: 'NEXA Renamed', timezone: 'Asia/Tokyo' });
    const badZone = await request(app)
      .put(orgPath(id))
      .set(bearer(owner.accessToken))
      .send({ timezone: 'Mars/Olympus' });

    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe('PERMISSION_DENIED');
    expect(byOwner.body.data).toMatchObject({ name: 'NEXA Renamed', timezone: 'Asia/Tokyo' });
    expect(badZone.status).toBe(400);
  });
});

describe('members', () => {
  it('lists members with their profile and role', async () => {
    const { owner } = await createTeam(app);

    const res = await request(app)
      .get(orgPath(await defaultOrganizationId(), '/members'))
      .query({ page: 1, limit: 2 })
      .set(bearer(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      role: 'OWNER',
      status: 'ACTIVE',
      user: { id: owner.user.id },
    });
    expect(res.body.pagination).toMatchObject({ total: 3, total_pages: 2, has_next: true });
  });

  it('applies role changes on the next request, with the same token (risk register 4.4)', async () => {
    const { owner, alice } = await createTeam(app);
    const id = await defaultOrganizationId();

    const before = await request(app)
      .put(orgPath(id))
      .set(bearer(alice.accessToken))
      .send({ name: 'By Alice' });
    const promoted = await patchMember(owner.accessToken, id, alice.user.id, { role: 'ADMIN' });
    const after = await request(app)
      .put(orgPath(id))
      .set(bearer(alice.accessToken))
      .send({ name: 'By Alice' });

    expect(before.status).toBe(403);
    expect(promoted.body.data).toMatchObject({ role: 'ADMIN', user: { id: alice.user.id } });
    expect(after.status).toBe(200);
  });

  it('prevents privilege escalation through the role hierarchy', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const id = await defaultOrganizationId();
    await patchMember(owner.accessToken, id, alice.user.id, { role: 'ADMIN' });

    const grantOwner = await patchMember(alice.accessToken, id, bob.user.id, { role: 'OWNER' });
    const selfPromote = await patchMember(alice.accessToken, id, alice.user.id, { role: 'OWNER' });
    const touchOwner = await patchMember(alice.accessToken, id, owner.user.id, { role: 'MEMBER' });
    const grantManager = await patchMember(alice.accessToken, id, bob.user.id, { role: 'MANAGER' });
    const managerActs = await patchMember(bob.accessToken, id, alice.user.id, { role: 'MEMBER' });

    expect(grantOwner.status).toBe(403);
    expect(grantOwner.body.code).toBe('ROLE_ASSIGNMENT_FORBIDDEN');
    expect(selfPromote.status).toBe(403);
    expect(touchOwner.status).toBe(403);
    expect(touchOwner.body.code).toBe('MEMBER_MANAGEMENT_FORBIDDEN');
    expect(grantManager.status).toBe(200);
    expect(managerActs.status).toBe(403);
    expect(managerActs.body.code).toBe('PERMISSION_DENIED');
  });

  it('always keeps at least one active owner', async () => {
    const { owner, alice } = await createTeam(app);
    const id = await defaultOrganizationId();

    const demoteSelf = await patchMember(owner.accessToken, id, owner.user.id, { role: 'ADMIN' });
    const leave = await removeMember(owner.accessToken, id, owner.user.id);
    await patchMember(owner.accessToken, id, alice.user.id, { role: 'OWNER' });
    const afterHandover = await patchMember(owner.accessToken, id, owner.user.id, {
      role: 'ADMIN',
    });

    for (const res of [demoteSelf, leave]) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LAST_OWNER');
    }
    expect(afterHandover.status).toBe(200);
  });

  it('never loses the last owner when two owners demote each other at the same time', async () => {
    const { owner, alice } = await createTeam(app);
    const id = await defaultOrganizationId();
    await patchMember(owner.accessToken, id, alice.user.id, { role: 'OWNER' });

    const results = await Promise.all([
      patchMember(owner.accessToken, id, alice.user.id, { role: 'ADMIN' }),
      patchMember(alice.accessToken, id, owner.user.id, { role: 'ADMIN' }),
    ]);

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    const owners = await prisma.organizationMember.count({
      where: { organizationId: id, status: 'ACTIVE', role: { key: 'OWNER' } },
    });
    expect(owners).toBe(1);
  });

  it('suspends and reactivates members; nobody suspends themselves', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const id = await defaultOrganizationId();
    await patchMember(owner.accessToken, id, alice.user.id, { role: 'ADMIN' });

    const suspended = await patchMember(alice.accessToken, id, bob.user.id, {
      status: 'SUSPENDED',
    });
    const whileSuspended = await getFeed(bob.accessToken);
    await patchMember(alice.accessToken, id, bob.user.id, { status: 'ACTIVE' });
    const reactivated = await getFeed(bob.accessToken);
    const selfSuspend = await patchMember(owner.accessToken, id, owner.user.id, {
      status: 'SUSPENDED',
    });

    expect(suspended.body.data.status).toBe('SUSPENDED');
    expect(whileSuspended.body.code).toBe('MEMBERSHIP_SUSPENDED');
    expect(reactivated.status).toBe(200);
    expect(selfSuspend.status).toBe(400);
    expect(selfSuspend.body.code).toBe('CANNOT_SUSPEND_SELF');
  });

  it('removes members and lets anyone leave', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const id = await defaultOrganizationId();

    const byMember = await removeMember(alice.accessToken, id, bob.user.id);
    const byOwner = await removeMember(owner.accessToken, id, bob.user.id);
    const leave = await removeMember(alice.accessToken, id, alice.user.id);
    const missing = await removeMember(owner.accessToken, id, bob.user.id);
    const bobFeed = await getFeed(bob.accessToken);

    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe('PERMISSION_DENIED');
    expect(byOwner.body.data).toEqual({ user_id: bob.user.id, removed: true });
    expect(leave.status).toBe(200);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('MEMBER_NOT_FOUND');
    expect(bobFeed.body.code).toBe('NO_ORGANIZATION');
  });
});
