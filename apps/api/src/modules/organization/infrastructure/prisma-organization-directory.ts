import type { PrismaClient } from '../../../generated/prisma/client';
import type { OrganizationDirectory } from '../domain/organization-directory';

export class PrismaOrganizationDirectory implements OrganizationDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveMemberIds(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId, status: 'ACTIVE', userId: { in: [...new Set(userIds)] } },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  async listActiveMemberIds(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}
