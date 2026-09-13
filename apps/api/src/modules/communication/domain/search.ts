import type { SearchPage, SearchQuery, SearchWindow } from '../../../shared/search/search-query';
import type { ConversationType } from './conversation';
import type { ChatActor } from './policies';

export interface ConversationSearchHit {
  id: string;
  type: ConversationType;
  name: string | null;
  slug: string | null;
  description: string | null;
  archived: boolean;
  memberCount: number;
  /** Whether the actor is a member. */
  joined: boolean;
}

export interface MessageSearchHit {
  id: string;
  seq: number;
  conversationId: string;
  conversationType: ConversationType;
  conversationName: string | null;
  /** The other person of a direct conversation. */
  directPeerId: string | null;
  senderId: string;
  content: string;
  createdAt: Date;
}

/**
 * Chat search with the same access rules as reading (risk register 14, ADR-015): channels are
 * public within the organization, groups only to their members, and messages only to members of
 * their conversation - organization admins included.
 */
export interface ChatSearch {
  conversations(
    actor: ChatActor,
    query: SearchQuery,
    window: SearchWindow,
  ): Promise<SearchPage<ConversationSearchHit>>;
  messages(
    actor: ChatActor,
    query: SearchQuery,
    window: SearchWindow,
  ): Promise<SearchPage<MessageSearchHit>>;
}
