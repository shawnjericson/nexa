import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import {
  describeUniqueViolation,
  isRecordNotFound,
  isUniqueViolation,
} from '../../../infrastructure/database/prisma-errors';
import { ChatErrors } from '../domain/chat-errors';
import type {
  Conversation,
  ConversationMembership,
  ConversationRole,
} from '../domain/conversation';
import type {
  ActivityCursor,
  ChannelListing,
  ConversationChanges,
  ConversationRepository,
  NewConversation,
} from '../domain/ports';

const CONVERSATION_SELECT = {
  id: true,
  organizationId: true,
  type: true,
  name: true,
  description: true,
  avatarUrl: true,
  slug: true,
  createdById: true,
  lastMessageSeq: true,
  lastMessageAt: true,
  lastActivityAt: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.ConversationSelect;

const MEMBERSHIP_SELECT = {
  conversationId: true,
  userId: true,
  role: true,
  lastReadSeq: true,
  mutedUntil: true,
  joinedAt: true,
} satisfies Prisma.ConversationMemberSelect;

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create({ members, ...conversation }: NewConversation): Promise<Conversation | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.conversation.create({
          data: conversation,
          select: CONVERSATION_SELECT,
        });
        await tx.conversationMember.createMany({
          data: members.map((member) => ({
            conversationId: created.id,
            organizationId: created.organizationId,
            userId: member.userId,
            role: member.role,
          })),
        });
        return created;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const detail = describeUniqueViolation(err);
      if (detail.includes('slug')) throw ChatErrors.channelExists();
      if (detail.includes('direct')) return null;
      throw err;
    }
  }

  findById(organizationId: string, id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({
      where: { id, organizationId },
      select: CONVERSATION_SELECT,
    });
  }

  findDirect(organizationId: string, directKey: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { organizationId_directKey: { organizationId, directKey } },
      select: CONVERSATION_SELECT,
    });
  }

  async update(
    organizationId: string,
    id: string,
    changes: ConversationChanges,
  ): Promise<Conversation | null> {
    try {
      return await this.prisma.conversation.update({
        where: { id, organizationId },
        data: changes,
        select: CONVERSATION_SELECT,
      });
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      if (isUniqueViolation(err)) throw ChatErrors.channelExists();
      throw err;
    }
  }

  async listForUser(
    organizationId: string,
    userId: string,
    { take, after }: { take: number; after?: ActivityCursor },
  ): Promise<Array<{ conversation: Conversation; membership: ConversationMembership }>> {
    const rows = await this.prisma.conversationMember.findMany({
      where: {
        organizationId,
        userId,
        // (last_activity_at, id) < (cursor.lastActivityAt, cursor.id)
        ...(after && {
          conversation: {
            OR: [
              { lastActivityAt: { lt: after.lastActivityAt } },
              { lastActivityAt: after.lastActivityAt, id: { lt: after.id } },
            ],
          },
        }),
      },
      orderBy: [{ conversation: { lastActivityAt: 'desc' } }, { conversationId: 'desc' }],
      take,
      select: { ...MEMBERSHIP_SELECT, conversation: { select: CONVERSATION_SELECT } },
    });
    return rows.map(({ conversation, ...membership }) => ({ conversation, membership }));
  }

  async listChannels(organizationId: string, userId: string): Promise<ChannelListing[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { organizationId, type: 'CHANNEL' },
      orderBy: { name: 'asc' },
      select: {
        ...CONVERSATION_SELECT,
        _count: { select: { members: true } },
        members: { where: { userId }, select: { userId: true } },
      },
    });
    return rows.map(({ _count, members, ...conversation }) => ({
      conversation,
      memberCount: _count.members,
      joined: members.length > 0,
    }));
  }

  findMembership(conversationId: string, userId: string): Promise<ConversationMembership | null> {
    return this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: MEMBERSHIP_SELECT,
    });
  }

  listMemberships(conversationId: string): Promise<ConversationMembership[]> {
    return this.prisma.conversationMember.findMany({
      where: { conversationId },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      select: MEMBERSHIP_SELECT,
    });
  }

  async listMemberIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async countMembers(conversationIds: readonly string[]): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    const groups = await this.prisma.conversationMember.groupBy({
      by: ['conversationId'],
      where: { conversationId: { in: [...conversationIds] } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.conversationId, group._count._all]));
  }

  async directPeers(
    conversationIds: readonly string[],
    userId: string,
  ): Promise<Map<string, string>> {
    if (conversationIds.length === 0) return new Map();
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: [...conversationIds] }, userId: { not: userId } },
      select: { conversationId: true, userId: true },
    });
    return new Map(rows.map((row) => [row.conversationId, row.userId]));
  }

  async addMembers(
    organizationId: string,
    conversationId: string,
    userIds: readonly string[],
    role: ConversationRole,
  ): Promise<void> {
    await this.prisma.conversationMember.createMany({
      data: userIds.map((userId) => ({ conversationId, organizationId, userId, role })),
      skipDuplicates: true,
    });
  }

  async removeMember(conversationId: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.conversationMember.deleteMany({
      where: { conversationId, userId },
    });
    return count > 0;
  }

  async ensureOwner(conversationId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE conversation_members
         SET role = 'OWNER'::"ConversationRole"
       WHERE conversation_id = ${conversationId}::uuid
         AND user_id = (
           SELECT user_id FROM conversation_members
            WHERE conversation_id = ${conversationId}::uuid
            ORDER BY joined_at, user_id
            LIMIT 1)
         AND NOT EXISTS (
           SELECT 1 FROM conversation_members
            WHERE conversation_id = ${conversationId}::uuid
              AND role = 'OWNER'::"ConversationRole")`;
  }

  async markRead(conversationId: string, userId: string, seq: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ last_read_seq: number }>>`
      UPDATE conversation_members
         SET last_read_seq = GREATEST(last_read_seq, ${seq}::int)
       WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
      RETURNING last_read_seq`;
    return rows[0]?.last_read_seq ?? 0;
  }
}
