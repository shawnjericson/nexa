import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PERMISSION_KEYS } from '../src/modules/organization';
import { bearer, registerAndLogin, registerUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('organization data model', () => {
  it('seeds exactly the permissions the code knows about', async () => {
    const rows = await prisma.permission.findMany({ select: { key: true } });

    expect(rows.map((row) => row.key).sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('gives a new organization the four system roles with their permissions', async () => {
    await registerUser(app);

    const roles = await prisma.role.findMany({
      include: { permissions: true },
      orderBy: { key: 'asc' },
    });
    const byKey = Object.fromEntries(
      roles.map((role) => [role.key, role.permissions.map((p) => p.permissionKey).sort()]),
    );

    expect(Object.keys(byKey).sort()).toEqual(['ADMIN', 'MANAGER', 'MEMBER', 'OWNER']);
    expect(byKey.OWNER).toEqual([...PERMISSION_KEYS].sort());
    expect(byKey.ADMIN).not.toContain('organization.delete');
    expect(byKey.MEMBER).toEqual(['channel.create']);
  });

  it('puts a new account in no organization at all when sign-up is invite-only', async () => {
    const inviteOnly = createApp({ prisma, config: { SIGNUP_MODE: 'invite' } });
    const stranger = await registerAndLogin(inviteOnly);

    const profile = await request(inviteOnly)
      .get('/api/v1/users/me')
      .set(bearer(stranger.accessToken));
    const feed = await request(inviteOnly).get('/api/v1/feed').set(bearer(stranger.accessToken));
    const chats = await request(inviteOnly)
      .get('/api/v1/conversations')
      .set(bearer(stranger.accessToken));
    const memberships = await prisma.organizationMember.count({
      where: { userId: stranger.user.id },
    });

    // They have an account, and that is all: nothing of anyone's workspace is readable.
    expect(profile.status).toBe(200);
    expect([feed.status, feed.body.code]).toEqual([403, 'NO_ORGANIZATION']);
    expect([chats.status, chats.body.code]).toEqual([403, 'NO_ORGANIZATION']);
    expect(memberships).toBe(0);
  });

  it('rejects a membership whose role belongs to another organization', async () => {
    const { user } = await registerUser(app);
    const home = await prisma.organization.findUniqueOrThrow({ where: { slug: 'nexa-test' } });
    const foreign = await prisma.organization.create({
      data: {
        slug: 'other-company',
        name: 'Other Company',
        roles: { create: { key: 'OWNER', name: 'Owner', isSystem: true } },
      },
      include: { roles: true },
    });
    await prisma.organizationMember.deleteMany({ where: { userId: user.id } });

    // Composite foreign key (role_id, organization_id) -> roles(id, organization_id).
    await expect(
      prisma.organizationMember.create({
        data: { organizationId: home.id, userId: user.id, roleId: foreign.roles[0]!.id },
      }),
    ).rejects.toThrow();
  });
});
