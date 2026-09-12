import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import {
  isRecordNotFound,
  isUniqueViolation,
} from '../../../infrastructure/database/prisma-errors';
import { OrganizationErrors } from '../domain/organization-errors';
import type { Department, DepartmentChanges, DepartmentRepository } from '../domain/ports';

const DEPARTMENT_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } },
} satisfies Prisma.DepartmentSelect;

type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof DEPARTMENT_SELECT }>;

function toDepartment({ _count, ...row }: DepartmentRow): Department {
  return { ...row, memberCount: _count.members };
}

export class PrismaDepartmentRepository implements DepartmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string): Promise<Department[]> {
    const rows = await this.prisma.department.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: DEPARTMENT_SELECT,
    });
    return rows.map(toDepartment);
  }

  async findById(organizationId: string, id: string): Promise<Department | null> {
    const row = await this.prisma.department.findFirst({
      where: { id, organizationId },
      select: DEPARTMENT_SELECT,
    });
    return row && toDepartment(row);
  }

  async create(department: {
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
  }): Promise<Department> {
    try {
      return toDepartment(
        await this.prisma.department.create({ data: department, select: DEPARTMENT_SELECT }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw OrganizationErrors.departmentExists();
      throw err;
    }
  }

  async update(
    organizationId: string,
    id: string,
    changes: DepartmentChanges,
  ): Promise<Department | null> {
    try {
      const row = await this.prisma.department.update({
        where: { id, organizationId },
        data: changes,
        select: DEPARTMENT_SELECT,
      });
      return toDepartment(row);
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      if (isUniqueViolation(err)) throw OrganizationErrors.departmentExists();
      throw err;
    }
  }

  async delete(organizationId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.department.deleteMany({ where: { id, organizationId } });
    return count > 0;
  }

  async listMemberIds(organizationId: string, departmentId: string): Promise<string[]> {
    const rows = await this.prisma.departmentMember.findMany({
      where: { organizationId, departmentId },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async addMember(organizationId: string, departmentId: string, userId: string): Promise<void> {
    await this.prisma.departmentMember.createMany({
      data: [{ organizationId, departmentId, userId }],
      skipDuplicates: true,
    });
  }

  async removeMember(organizationId: string, departmentId: string, userId: string): Promise<void> {
    await this.prisma.departmentMember.deleteMany({
      where: { organizationId, departmentId, userId },
    });
  }
}
