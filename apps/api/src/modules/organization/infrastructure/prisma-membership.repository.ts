import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import type { LockedMembers, Member, MemberChange, MembershipRepository } from '../domain/ports';

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

  async listMembers(
    organizationId: string,
    { skip, take }: { skip: number; take: number },
  ): Promise<{ items: Member[]; total: number }> {
    const where = { organizationId } satisfies Prisma.OrganizationMemberWhereInput;
    const [rows, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where,
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: MEMBER_SELECT,
      }),
      this.prisma.organizationMember.count({ where }),
    ]);
    return { items: rows.map(toMember), total };
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
