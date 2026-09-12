import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import type { Invitation } from '../domain/invitation';
import type { AcceptOutcome, InvitationRepository, NewInvitation } from '../domain/ports';

const INVITATION_SELECT = {
  id: true,
  organizationId: true,
  email: true,
  invitedById: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  role: { select: { key: true } },
} satisfies Prisma.InvitationSelect;

type InvitationRow = Prisma.InvitationGetPayload<{ select: typeof INVITATION_SELECT }>;

function toInvitation({ role, ...row }: InvitationRow): Invitation {
  return { ...row, roleKey: role.key };
}

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  replacePending(invitation: NewInvitation, at: Date): Promise<Invitation> {
    const { organizationId, email, roleKey, ...rest } = invitation;
    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { organizationId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: at },
      });
      const role = await tx.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId, key: roleKey } },
        select: { id: true },
      });
      const row = await tx.invitation.create({
        data: { organizationId, email, roleId: role.id, ...rest },
        select: INVITATION_SELECT,
      });
      return toInvitation(row);
    });
  }

  async listPending(organizationId: string, at: Date): Promise<Invitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: at } },
      orderBy: { createdAt: 'desc' },
      select: INVITATION_SELECT,
    });
    return rows.map(toInvitation);
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const row = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      select: INVITATION_SELECT,
    });
    return row && toInvitation(row);
  }

  async revoke(organizationId: string, id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id, organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: at },
    });
    return count > 0;
  }

  accept(invitationId: string, userId: string, at: Date): Promise<AcceptOutcome> {
    return this.prisma.$transaction(async (tx): Promise<AcceptOutcome> => {
      const invitation = await tx.invitation.findUniqueOrThrow({
        where: { id: invitationId },
        select: { organizationId: true, roleId: true },
      });
      const { organizationId } = invitation;
      // Same lock as other membership changes: concurrent acceptances are serialized.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { id: true },
      });
      if (existing) return 'ALREADY_MEMBER';

      // Conditional update: an invitation can be consumed exactly once (risk register 6).
      const { count } = await tx.invitation.updateMany({
        where: { id: invitationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: at } },
        data: { acceptedAt: at, acceptedById: userId },
      });
      if (count === 0) return 'UNAVAILABLE';

      await tx.organizationMember.create({
        data: { organizationId, userId, roleId: invitation.roleId },
      });
      return 'ACCEPTED';
    });
  }
}
