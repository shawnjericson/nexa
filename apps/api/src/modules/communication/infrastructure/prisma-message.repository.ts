import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { isRecordNotFound } from '../../../infrastructure/database/prisma-errors';
import type { Message } from '../domain/conversation';
import type { MessageRepository, NewMessage } from '../domain/ports';

const MESSAGE_SELECT = {
  id: true,
  organizationId: true,
  conversationId: true,
  senderId: true,
  seq: true,
  clientMessageId: true,
  type: true,
  content: true,
  replyToId: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  attachments: { select: { fileId: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function toMessage({ attachments, ...row }: MessageRow): Message {
  return { ...row, attachmentIds: attachments.map((attachment) => attachment.fileId) };
}

// Appends queue behind the conversation lock, so allow them more time than Prisma's defaults.
const APPEND_TRANSACTION = { maxWait: 10_000, timeout: 20_000 };

export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  append(
    { attachmentIds, ...message }: NewMessage,
    at: Date,
  ): Promise<{ message: Message; created: boolean }> {
    const { conversationId, senderId, clientMessageId } = message;
    return this.prisma.$transaction(async (tx) => {
      // One writer per conversation at a time: this makes seq gap-free and the duplicate check
      // below race-free (ADR-015).
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;

      const existing = await tx.message.findUnique({
        where: {
          conversationId_senderId_clientMessageId: { conversationId, senderId, clientMessageId },
        },
        select: MESSAGE_SELECT,
      });
      if (existing) return { message: toMessage(existing), created: false };

      const [next] = await tx.$queryRaw<Array<{ seq: number }>>`
        UPDATE conversations
           SET last_message_seq = last_message_seq + 1,
               last_message_at = ${at},
               last_activity_at = ${at}
         WHERE id = ${conversationId}::uuid
        RETURNING last_message_seq AS seq`;
      if (!next) throw new Error('Conversation disappeared while sending a message');

      const created = await tx.message.create({
        data: { ...message, seq: next.seq, createdAt: at },
        select: MESSAGE_SELECT,
      });
      if (attachmentIds.length > 0) {
        await tx.messageAttachment.createMany({
          data: attachmentIds.map((fileId, position) => ({
            organizationId: message.organizationId,
            messageId: created.id,
            fileId,
            position,
          })),
        });
      }
      // The sender has read their own message.
      await tx.$executeRaw`
        UPDATE conversation_members
           SET last_read_seq = GREATEST(last_read_seq, ${next.seq}::int)
         WHERE conversation_id = ${conversationId}::uuid AND user_id = ${senderId}::uuid`;
      return { message: { ...toMessage(created), attachmentIds }, created: true };
    }, APPEND_TRANSACTION);
  }

  async findById(conversationId: string, id: string): Promise<Message | null> {
    const row = await this.prisma.message.findFirst({
      where: { id, conversationId },
      select: MESSAGE_SELECT,
    });
    return row && toMessage(row);
  }

  async findBySeqs(positions: Array<{ conversationId: string; seq: number }>): Promise<Message[]> {
    if (positions.length === 0) return [];
    const rows = await this.prisma.message.findMany({
      where: { OR: positions.map(({ conversationId, seq }) => ({ conversationId, seq })) },
      select: MESSAGE_SELECT,
    });
    return rows.map(toMessage);
  }

  async list(
    conversationId: string,
    { beforeSeq, afterSeq, limit }: { beforeSeq?: number; afterSeq?: number; limit: number },
  ): Promise<{ items: Message[]; hasMore: boolean }> {
    if (afterSeq !== undefined) {
      // Catching up after a reconnect: everything newer than what the client has, oldest first.
      const rows = await this.prisma.message.findMany({
        where: { conversationId, seq: { gt: afterSeq } },
        orderBy: { seq: 'asc' },
        take: limit + 1,
        select: MESSAGE_SELECT,
      });
      return { items: rows.slice(0, limit).map(toMessage), hasMore: rows.length > limit };
    }

    // Scrolling back: the newest page (or the page before beforeSeq), returned oldest first.
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(beforeSeq !== undefined && { seq: { lt: beforeSeq } }) },
      orderBy: { seq: 'desc' },
      take: limit + 1,
      select: MESSAGE_SELECT,
    });
    return { items: rows.slice(0, limit).reverse().map(toMessage), hasMore: rows.length > limit };
  }

  async edit(
    conversationId: string,
    id: string,
    content: string,
    at: Date,
  ): Promise<Message | null> {
    try {
      return toMessage(
        await this.prisma.message.update({
          where: { id, conversationId, deletedAt: null },
          data: { content, editedAt: at },
          select: MESSAGE_SELECT,
        }),
      );
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      throw err;
    }
  }

  /**
   * The row stays as a tombstone; its text and attachments are erased. The files then belong to
   * nothing and are purged by the File module (ADR-017).
   */
  async softDelete(conversationId: string, id: string, at: Date): Promise<Message | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.message.update({
          where: { id, conversationId, deletedAt: null },
          data: { deletedAt: at, content: '' },
          select: MESSAGE_SELECT,
        });
        await tx.messageAttachment.deleteMany({ where: { messageId: id } });
        return { ...toMessage(row), attachmentIds: [] };
      });
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      throw err;
    }
  }
}
