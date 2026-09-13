import { toUserReference, type UserSummary } from '../../identity';
import type { ConversationDetails, ConversationSummary } from '../application/conversation.service';
import { unreadCount, type Conversation, type Message } from '../domain/conversation';
import type { ChannelListing } from '../domain/ports';

type Users = ReadonlyMap<string, UserSummary>;

/** Same shape over REST and WebSocket, so clients reconcile both by id / client_message_id. */
export function toMessageResponse(message: Message, users: Users) {
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    conversation_id: message.conversationId,
    seq: message.seq,
    sender: toUserReference(users.get(message.senderId)),
    type: message.type,
    content: deleted ? null : message.content,
    reply_to_id: message.replyToId,
    client_message_id: message.clientMessageId,
    created_at: message.createdAt.toISOString(),
    edited_at: message.editedAt?.toISOString() ?? null,
    deleted,
  };
}

function toConversationBase(conversation: Conversation) {
  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name,
    description: conversation.description,
    avatar_url: conversation.avatarUrl,
    slug: conversation.slug,
    archived: conversation.archivedAt !== null,
    last_message_seq: conversation.lastMessageSeq,
    last_message_at: conversation.lastMessageAt?.toISOString() ?? null,
    created_at: conversation.createdAt.toISOString(),
  };
}

export function toConversationSummaryResponse(summary: ConversationSummary, users: Users) {
  const { conversation, membership } = summary;
  return {
    ...toConversationBase(conversation),
    member_count: summary.memberCount,
    direct_peer: summary.directPeerId ? toUserReference(users.get(summary.directPeerId)) : null,
    my_role: membership.role,
    last_read_seq: membership.lastReadSeq,
    unread_count: unreadCount(conversation, membership),
    muted_until: membership.mutedUntil?.toISOString() ?? null,
    last_message: summary.lastMessage ? toMessageResponse(summary.lastMessage, users) : null,
  };
}

export function toConversationDetailsResponse(details: ConversationDetails, users: Users) {
  const { conversation, membership } = details;
  return {
    ...toConversationBase(conversation),
    member_count: details.members.length,
    direct_peer: details.directPeerId ? toUserReference(users.get(details.directPeerId)) : null,
    my_role: membership?.role ?? null,
    last_read_seq: membership?.lastReadSeq ?? null,
    unread_count: membership ? unreadCount(conversation, membership) : null,
    // Per-member read positions let clients show read receipts.
    members: details.members.map((member) => ({
      user: toUserReference(users.get(member.userId)),
      role: member.role,
      last_read_seq: member.lastReadSeq,
      joined_at: member.joinedAt.toISOString(),
    })),
  };
}

export function toChannelResponse(listing: ChannelListing) {
  return {
    ...toConversationBase(listing.conversation),
    member_count: listing.memberCount,
    joined: listing.joined,
  };
}
