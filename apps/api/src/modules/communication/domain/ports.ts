import type {
  Conversation,
  ConversationMembership,
  ConversationRole,
  ConversationType,
  Message,
  MessageType,
} from './conversation';

export interface NewConversation {
  organizationId: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  slug: string | null;
  directKey: string | null;
  createdById: string;
  members: Array<{ userId: string; role: ConversationRole }>;
}

export interface ConversationChanges {
  name?: string;
  slug?: string | null;
  description?: string | null;
  archivedAt?: Date | null;
}

/** Keyset position in a conversation list: (last_activity_at, id). */
export interface ActivityCursor {
  lastActivityAt: Date;
  id: string;
}

export interface ChannelListing {
  conversation: Conversation;
  memberCount: number;
  joined: boolean;
}

export interface ConversationRepository {
  /**
   * Creates the conversation with its members. Throws ChatErrors.channelExists on a slug conflict
   * and returns null when the pair already has a direct conversation.
   */
  create(conversation: NewConversation): Promise<Conversation | null>;
  findById(organizationId: string, id: string): Promise<Conversation | null>;
  findDirect(organizationId: string, directKey: string): Promise<Conversation | null>;
  /** Returns null when the conversation doesn't exist; throws channelExists on a slug conflict. */
  update(
    organizationId: string,
    id: string,
    changes: ConversationChanges,
  ): Promise<Conversation | null>;
  /** The user's conversations, most recently active first. */
  listForUser(
    organizationId: string,
    userId: string,
    options: { take: number; after?: ActivityCursor },
  ): Promise<Array<{ conversation: Conversation; membership: ConversationMembership }>>;
  listChannels(organizationId: string, userId: string): Promise<ChannelListing[]>;
  findMembership(conversationId: string, userId: string): Promise<ConversationMembership | null>;
  listMemberships(conversationId: string): Promise<ConversationMembership[]>;
  listMemberIds(conversationId: string): Promise<string[]>;
  countMembers(conversationIds: readonly string[]): Promise<Map<string, number>>;
  /** Other participant of each direct conversation. */
  directPeers(conversationIds: readonly string[], userId: string): Promise<Map<string, string>>;
  /** Idempotent. */
  addMembers(
    organizationId: string,
    conversationId: string,
    userIds: readonly string[],
    role: ConversationRole,
  ): Promise<void>;
  /** Returns false when the user was not a member. */
  removeMember(conversationId: string, userId: string): Promise<boolean>;
  /** Makes the longest-standing member OWNER when no owner is left. */
  ensureOwner(conversationId: string): Promise<void>;
  /** Moves the read position forward only (risk register 9.6); returns the resulting position. */
  markRead(conversationId: string, userId: string, seq: number): Promise<number>;
}

export interface NewMessage {
  organizationId: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  type: MessageType;
  content: string;
  replyToId: string | null;
  /** Verified by the File module beforehand; stored in the same transaction as the message. */
  attachmentIds: string[];
}

export interface MessageRepository {
  /**
   * Appends under a lock on the conversation row: assigns the next gap-free seq, or returns the
   * sender's earlier message with the same clientMessageId (risk register 9.1 and 9.2).
   * The sender's read position moves to the new message.
   */
  append(message: NewMessage, at: Date): Promise<{ message: Message; created: boolean }>;
  findById(conversationId: string, id: string): Promise<Message | null>;
  findBySeqs(positions: Array<{ conversationId: string; seq: number }>): Promise<Message[]>;
  /** Ascending by seq: the newest page by default, older with beforeSeq, newer with afterSeq. */
  list(
    conversationId: string,
    options: { beforeSeq?: number; afterSeq?: number; limit: number },
  ): Promise<{ items: Message[]; hasMore: boolean }>;
  /** Return null when the message no longer exists or is deleted. */
  edit(conversationId: string, id: string, content: string, at: Date): Promise<Message | null>;
  softDelete(conversationId: string, id: string, at: Date): Promise<Message | null>;
}

/** Live connections per user (risk register 9.5 and 11): online while at least one is alive. */
export interface PresenceStore {
  /** Registers a connection; returns true when the user just came online. */
  connect(
    organizationId: string,
    userId: string,
    connectionId: string,
    ttlMs: number,
  ): Promise<boolean>;
  heartbeat(
    organizationId: string,
    userId: string,
    connectionId: string,
    ttlMs: number,
  ): Promise<void>;
  /** Removes a connection; returns true when the user has no live connection left. */
  disconnect(organizationId: string, userId: string, connectionId: string): Promise<boolean>;
  onlineUserIds(organizationId: string, userIds: readonly string[]): Promise<Set<string>>;
  /** How many people in the organization are online, not counting `exceptUserId`. */
  countOnline(organizationId: string, exceptUserId?: string): Promise<number>;
}

/** Pushes chat events to connected clients (implemented over Socket.IO). */
export interface ChatRealtime {
  messageCreated(
    conversation: Conversation,
    recipientIds: readonly string[],
    message: Message,
  ): Promise<void>;
  messageUpdated(
    conversation: Conversation,
    recipientIds: readonly string[],
    message: Message,
  ): Promise<void>;
  messageDeleted(
    conversation: Conversation,
    recipientIds: readonly string[],
    message: Message,
  ): Promise<void>;
  readUpdated(
    conversation: Conversation,
    recipientIds: readonly string[],
    reader: { userId: string; lastReadSeq: number },
  ): Promise<void>;
  membersChanged(
    conversation: Conversation,
    recipientIds: readonly string[],
    change: { added?: string[]; removed?: string[] },
  ): Promise<void>;
}
