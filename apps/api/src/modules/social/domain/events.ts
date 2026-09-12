import type { DomainEvent } from '../../../shared/events/event-bus';
import type { PostType, ReactionType } from './content';

export const POST_CREATED = 'social.post_created';
export const COMMENT_CREATED = 'social.comment_created';
export const POST_REACTED = 'social.post_reacted';

export type PostCreatedEvent = DomainEvent<typeof POST_CREATED, { post_type: PostType }>;

export type CommentCreatedEvent = DomainEvent<
  typeof COMMENT_CREATED,
  { post_id: string; post_author_id: string; parent_id: string | null }
>;

export type PostReactedEvent = DomainEvent<
  typeof POST_REACTED,
  { post_id: string; post_author_id: string; reaction: ReactionType }
>;
