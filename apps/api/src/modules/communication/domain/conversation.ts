export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';
export type ConversationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';

export interface Conversation {
  id: string;
  organizationId: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  slug: string | null;
  createdById: string;
  lastMessageSeq: number;
  lastMessageAt: Date | null;
  lastActivityAt: Date;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface ConversationMembership {
  conversationId: string;
  userId: string;
  role: ConversationRole;
  lastReadSeq: number;
  mutedUntil: Date | null;
  joinedAt: Date;
}

export interface Message {
  id: string;
  organizationId: string;
  conversationId: string;
  senderId: string;
  /** Server-assigned, gap-free position in the conversation (risk register 9.2). */
  seq: number;
  clientMessageId: string | null;
  type: MessageType;
  content: string;
  replyToId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

/** A pair of people has at most one direct conversation per organization. */
export function directKeyOf(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

export function unreadCount(
  conversation: Pick<Conversation, 'lastMessageSeq'>,
  membership: Pick<ConversationMembership, 'lastReadSeq'>,
): number {
  return Math.max(0, conversation.lastMessageSeq - membership.lastReadSeq);
}
