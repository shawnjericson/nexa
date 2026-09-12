import type { PrismaClient } from '../../../generated/prisma/client';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors';
import { SYSTEM_ROLES, type SystemRoleKey } from '../domain/permissions';
import type { MembershipRecord, OrganizationRepository } from '../domain/ports';

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureOrganization({ slug, name }: { slug: string; name: string }) {
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) return existing;

    try {
      // Organization, roles and role permissions are created atomically in one nested write.
      return await this.prisma.organization.create({
        data: {
          slug,
          name,
          roles: {
            create: SYSTEM_ROLES.map((role) => ({
              key: role.key,
              name: role.name,
              isSystem: true,
              permissions: {
                create: role.permissions.map((permissionKey) => ({ permissionKey })),
              },
            })),
          },
        },
        select: { id: true },
      });
    } catch (err) {
      // Another request created it concurrently.
      if (isUniqueViolation(err)) {
        const created = await this.prisma.organization.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (created) return created;
      }
      throw err;
    }
  }

  async addMember(
    organizationId: string,
    userId: string,
    roles: { firstMember: SystemRoleKey; others: SystemRoleKey },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serialize joins per organization so exactly one user can become the first member.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { id: true },
      });
      if (existing) return;

      const memberCount = await tx.organizationMember.count({ where: { organizationId } });
      const role = await tx.role.findUniqueOrThrow({
        where: {
          organizationId_key: {
            organizationId,
            key: memberCount === 0 ? roles.firstMember : roles.others,
          },
        },
        select: { id: true },
      });
      await tx.organizationMember.create({ data: { organizationId, userId, roleId: role.id } });
    });
  }

  async sharesActiveOrganization(userA: string, userB: string): Promise<boolean> {
    const shared = await this.prisma.organizationMember.findFirst({
      where: {
        userId: userB,
        status: 'ACTIVE',
        organization: { members: { some: { userId: userA, status: 'ACTIVE' } } },
      },
      select: { id: true },
    });
    return shared !== null;
  }

  async findMemberships(
    userId: string,
    { organizationId, limit }: { organizationId?: string; limit: number },
  ): Promise<MembershipRecord[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId, ...(organizationId && { organizationId }) },
      orderBy: { joinedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        status: true,
        role: { select: { key: true, permissions: { select: { permissionKey: true } } } },
      },
    });
    return rows.map((row) => ({
      membershipId: row.id,
      organizationId: row.organizationId,
      status: row.status,
      roleKey: row.role.key,
      permissions: row.role.permissions.map((permission) => permission.permissionKey),
    }));
  }
}
