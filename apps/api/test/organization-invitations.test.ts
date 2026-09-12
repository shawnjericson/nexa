import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

/** The default-organization team plus "Acme Corp", owned by the team owner. */
async function setup() {
  const team = await createTeam(app);
  const acme = await request(app)
    .post('/api/v1/organizations')
    .set(bearer(team.owner.accessToken))
    .send({ name: 'Acme Corp' });
  return { ...team, acmeId: acme.body.data.id as string };
}

async function defaultOrganizationId() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'nexa-test' },
  });
  return organization.id;
}

const invite = (token: string, orgId: string, body: { email: string; role?: string }) =>
  request(app).post(`/api/v1/organizations/${orgId}/invitations`).set(bearer(token)).send(body);

const accept = (token: string, invitationToken: string) =>
  request(app)
    .post('/api/v1/invitations/accept')
    .set(bearer(token))
    .send({ token: invitationToken });

describe('invitations', () => {
  it('invites by email and lets the invitee join with the invited role', async () => {
    const { owner, alice, acmeId } = await setup();

    const invited = await invite(owner.accessToken, acmeId, {
      email: alice.input.email.toUpperCase(),
      role: 'MANAGER',
    });
    const joined = await accept(alice.accessToken, invited.body.data.token);
    const pending = await request(app)
      .get(`/api/v1/organizations/${acmeId}/invitations`)
      .set(bearer(owner.accessToken));
    const members = await request(app)
      .get(`/api/v1/organizations/${acmeId}/members`)
      .set(bearer(alice.accessToken));

    expect(invited.status).toBe(201);
    expect(invited.body.data).toMatchObject({
      email: alice.input.email,
      role: 'MANAGER',
      status: 'PENDING',
      invited_by_id: owner.user.id,
    });
    expect(invited.body.data.token).toMatch(/^[\w-]{43}$/);
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: invited.body.data.id },
    });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toBe(invited.body.data.token);

    expect(joined.status).toBe(200);
    expect(joined.body.data).toEqual({ organization_id: acmeId, role: 'MANAGER' });
    expect(pending.body.data).toEqual([]);
    expect(members.body.pagination.total).toBe(2);
  });

  it('only works for the invited email address', async () => {
    const { owner, alice, bob, acmeId } = await setup();
    const invited = await invite(owner.accessToken, acmeId, { email: alice.input.email });

    const res = await accept(bob.accessToken, invited.body.data.token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVITATION_EMAIL_MISMATCH');
  });

  it('rejects used, expired, revoked and unknown invitations', async () => {
    const { owner, alice, bob, acmeId } = await setup();
    const carol = await registerAndLogin(app);
    const forAlice = (await invite(owner.accessToken, acmeId, { email: alice.input.email })).body
      .data;
    const forBob = (await invite(owner.accessToken, acmeId, { email: bob.input.email })).body.data;
    const forCarol = (await invite(owner.accessToken, acmeId, { email: carol.input.email })).body
      .data;

    await accept(alice.accessToken, forAlice.token);
    await prisma.invitation.update({
      where: { id: forBob.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const revoked = await request(app)
      .delete(`/api/v1/organizations/${acmeId}/invitations/${forCarol.id}`)
      .set(bearer(owner.accessToken));

    const reused = await accept(alice.accessToken, forAlice.token);
    const expired = await accept(bob.accessToken, forBob.token);
    const cancelled = await accept(carol.accessToken, forCarol.token);
    const unknown = await accept(carol.accessToken, 'never-issued');

    expect(revoked.body.data).toEqual({ id: forCarol.id, revoked: true });
    expect([reused.status, reused.body.code]).toEqual([409, 'INVITATION_ALREADY_USED']);
    expect([expired.status, expired.body.code]).toEqual([410, 'INVITATION_EXPIRED']);
    expect([cancelled.status, cancelled.body.code]).toEqual([410, 'INVITATION_REVOKED']);
    expect([unknown.status, unknown.body.code]).toEqual([404, 'INVITATION_NOT_FOUND']);
  });

  it('replaces a pending invitation when the same person is invited again', async () => {
    const { owner, alice, acmeId } = await setup();
    const first = (await invite(owner.accessToken, acmeId, { email: alice.input.email })).body.data;
    const second = (
      await invite(owner.accessToken, acmeId, { email: alice.input.email, role: 'ADMIN' })
    ).body.data;

    const withFirst = await accept(alice.accessToken, first.token);
    const withSecond = await accept(alice.accessToken, second.token);

    expect(withFirst.body.code).toBe('INVITATION_REVOKED');
    expect(withSecond.body.data.role).toBe('ADMIN');
  });

  it('refuses to invite people who are already members', async () => {
    const { owner, alice } = await setup();

    const res = await invite(owner.accessToken, await defaultOrganizationId(), {
      email: alice.input.email,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_MEMBER');
  });

  it('enforces who may invite and which roles they may grant', async () => {
    const { owner, alice } = await setup();
    const orgId = await defaultOrganizationId();

    const asMember = await invite(alice.accessToken, orgId, { email: 'someone@nexa.test' });
    await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${alice.user.id}`)
      .set(bearer(owner.accessToken))
      .send({ role: 'MANAGER' });
    const tooHigh = await invite(alice.accessToken, orgId, {
      email: 'someone@nexa.test',
      role: 'ADMIN',
    });
    const allowed = await invite(alice.accessToken, orgId, {
      email: 'someone@nexa.test',
      role: 'MEMBER',
    });

    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe('PERMISSION_DENIED');
    expect(tooHigh.status).toBe(403);
    expect(tooHigh.body.code).toBe('ROLE_ASSIGNMENT_FORBIDDEN');
    expect(allowed.status).toBe(201);
  });

  it('lets only one of two simultaneous acceptances succeed', async () => {
    const { owner, alice, acmeId } = await setup();
    const invited = (await invite(owner.accessToken, acmeId, { email: alice.input.email })).body
      .data;

    const results = await Promise.all([
      accept(alice.accessToken, invited.token),
      accept(alice.accessToken, invited.token),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const memberships = await prisma.organizationMember.count({
      where: { organizationId: acmeId, userId: alice.user.id },
    });
    expect(memberships).toBe(1);
  });

  it('lists pending invitations without their tokens', async () => {
    const { owner, acmeId } = await setup();
    await invite(owner.accessToken, acmeId, { email: 'one@nexa.test' });
    await invite(owner.accessToken, acmeId, { email: 'two@nexa.test' });

    const list = await request(app)
      .get(`/api/v1/organizations/${acmeId}/invitations`)
      .set(bearer(owner.accessToken));

    expect(list.body.data.map((i: { email: string }) => i.email).sort()).toEqual([
      'one@nexa.test',
      'two@nexa.test',
    ]);
    expect(list.body.data[0]).not.toHaveProperty('token');
  });
});
