import { Prisma, type PrismaClient } from '../../../generated/prisma/client';
import type {
  LockedMembers,
  Member,
  MemberChange,
  MemberFilter,
  MembershipRepository,
} from '../domain/ports';

const MEMBER_SELECT = {
  id: true,
  userId: true,
  status: true,
  joinedAt: true,
  role: { select: { key: true } },
} satisfies Prisma.OrganizationMemberSelect;

type MemberRow = Prisma.OrganizationMemberGetPayload<{ select: typeof MEMBER_SELECT }>;

function toMember(row: MemberRow): Member {
  return {
    membershipId: row.id,
    userId: row.userId,
    roleKey: row.role.key,
    status: row.status,
    joinedAt: row.joinedAt,
  };
}

class PrismaLockedMembers implements LockedMembers {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {}

  async find(userId: string): Promise<Member | null> {
    const row = await this.tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: this.organizationId, userId } },
      select: MEMBER_SELECT,
    });
    return row && toMember(row);
  }

  countActiveOwners(): Promise<number> {
    return this.tx.organizationMember.count({
      where: { organizationId: this.organizationId, status: 'ACTIVE', role: { key: 'OWNER' } },
    });
  }

  async update(membershipId: string, change: MemberChange): Promise<Member> {
    const role = change.role
      ? await this.tx.role.findUniqueOrThrow({
          where: { organizationId_key: { organizationId: this.organizationId, key: change.role } },
          select: { id: true },
        })
      : null;
    const row = await this.tx.organizationMember.update({
      where: { id: membershipId, organizationId: this.organizationId },
      data: {
        ...(role && { roleId: role.id }),
        ...(change.status && { status: change.status }),
      },
      select: MEMBER_SELECT,
    });
    return toMember(row);
  }

  async remove(membershipId: string): Promise<void> {
    await this.tx.organizationMember.delete({
      where: { id: membershipId, organizationId: this.organizationId },
    });
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * One page of members, filtered and sorted in the database: an organization of thousands is
   * never sent whole for the browser to sift (which is what the directory used to do).
   */
  async listMembers(
    organizationId: string,
    { skip, take }: { skip: number; take: number },
    { query, departmentId, sort }: MemberFilter,
  ): Promise<{ items: Member[]; total: number }> {
    const inDepartment = (id: Prisma.Sql) =>
      Prisma.sql`EXISTS (SELECT 1 FROM department_members dm
                        WHERE dm.organization_id = m.organization_id AND dm.user_id = m.user_id
                          AND dm.department_id = ${id})`;
    const conditions = [
      Prisma.sql`m.organization_id = ${organizationId}::uuid`,
      ...(query
        ? [Prisma.sql`u.search_vector @@ to_tsquery('simple', nexa_unaccent(${query.tsquery}))`]
        : []),
      ...(departmentId === 'none'
        ? [
            Prisma.sql`NOT EXISTS (SELECT 1 FROM department_members dm
                                  WHERE dm.organization_id = m.organization_id
                                    AND dm.user_id = m.user_id)`,
          ]
        : departmentId
          ? [inDepartment(Prisma.sql`${departmentId}::uuid`)]
          : []),
    ];
    const where = Prisma.join(conditions, ' AND ');
    const order = {
      joined: Prisma.sql`m.joined_at ASC, m.id ASC`,
      newest: Prisma.sql`m.joined_at DESC, m.id DESC`,
      name: Prisma.sql`nexa_unaccent(lower(u.display_name)), u.id`,
    }[sort];

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<Member[]>`
        SELECT m.id AS "membershipId", m.user_id AS "userId", r.key AS "roleKey",
               m.status::text AS status, m.joined_at AS "joinedAt"
          FROM organization_members m
          JOIN roles r ON r.id = m.role_id
          JOIN users u ON u.id = m.user_id
         WHERE ${where}
         ORDER BY ${order}
         LIMIT ${take}::int OFFSET ${skip}::int`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
          FROM organization_members m
          JOIN users u ON u.id = m.user_id
         WHERE ${where}`,
    ]);
    return { items: rows, total: counted[0]?.total ?? 0 };
  }

  async findMember(organizationId: string, userId: string): Promise<Member | null> {
    const row = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: MEMBER_SELECT,
    });
    return row && toMember(row);
  }

  runLocked<T>(organizationId: string, work: (members: LockedMembers) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      return work(new PrismaLockedMembers(tx, organizationId));
    });
  }
}
