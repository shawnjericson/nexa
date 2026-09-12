import type { Express } from 'express';
import { SYSTEM_ROLES, type SystemRoleKey } from '../../src/modules/organization';
import { registerAndLogin } from './auth';
import { prisma } from './db';

/**
 * Three users in the default organization. The first registrant becomes OWNER
 * (holds post.moderate and announcement.publish); alice and bob are plain MEMBERs.
 */
export async function createTeam(app: Express) {
  const owner = await registerAndLogin(app);
  const [alice, bob] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
  return { owner, alice, bob };
}

export async function createOrganization(slug: string) {
  return prisma.organization.create({
    data: {
      slug,
      name: slug,
      roles: {
        create: SYSTEM_ROLES.map((role) => ({
          key: role.key,
          name: role.name,
          isSystem: true,
          permissions: { create: role.permissions.map((permissionKey) => ({ permissionKey })) },
        })),
      },
    },
    select: { id: true },
  });
}

export async function addMember(
  organizationId: string,
  userId: string,
  roleKey: SystemRoleKey = 'MEMBER',
  status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId, key: roleKey } },
    select: { id: true },
  });
  await prisma.organizationMember.create({
    data: { organizationId, userId, roleId: role.id, status },
  });
}

/** Moves a user out of every organization into a brand-new one (a different tenant). */
export async function moveToNewOrganization(userId: string, slug: string) {
  const organization = await createOrganization(slug);
  await prisma.organizationMember.deleteMany({ where: { userId } });
  await addMember(organization.id, userId, 'OWNER');
  return organization;
}
