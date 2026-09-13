import { snippet } from '../../../shared/search/snippet';
import type { ConversationSearchHit, MessageSearchHit } from '../../communication';
import { toUserReference, type UserSummary } from '../../identity';
import type { PostSearchHit } from '../../social';

type Users = ReadonlyMap<string, UserSummary>;

export function toPostHit(hit: PostSearchHit, users: Users, terms: readonly string[]) {
  return {
    id: hit.id,
    author: toUserReference(users.get(hit.authorId)),
    type: hit.type,
    snippet: snippet(hit.content, terms),
    created_at: hit.createdAt.toISOString(),
  };
}

export function toConversationHit(hit: ConversationSearchHit) {
  return {
    id: hit.id,
    type: hit.type,
    name: hit.name,
    slug: hit.slug,
    description: hit.description,
    archived: hit.archived,
    member_count: hit.memberCount,
    joined: hit.joined,
  };
}

export function toMessageHit(hit: MessageSearchHit, users: Users, terms: readonly string[]) {
  return {
    id: hit.id,
    seq: hit.seq,
    conversation: {
      id: hit.conversationId,
      type: hit.conversationType,
      name: hit.conversationName,
      direct_peer: hit.directPeerId ? toUserReference(users.get(hit.directPeerId)) : null,
    },
    sender: toUserReference(users.get(hit.senderId)),
    snippet: snippet(hit.content, terms),
    created_at: hit.createdAt.toISOString(),
  };
}

/** Users referenced by hits (authors, senders, direct peers), to resolve in one lookup. */
export function referencedUserIds(
  posts: readonly PostSearchHit[],
  messages: readonly MessageSearchHit[],
): string[] {
  return [
    ...posts.map((hit) => hit.authorId),
    ...messages.flatMap((hit) =>
      hit.directPeerId ? [hit.senderId, hit.directPeerId] : [hit.senderId],
    ),
  ];
}
