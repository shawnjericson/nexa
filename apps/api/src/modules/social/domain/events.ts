import type { DomainEvent } from '../../../shared/events/event-bus';
import type { PostType, ReactionType } from './content';

export const POST_CREATED = 'social.post_created';
export const POST_DELETED = 'social.post_deleted';
export const COMMENT_CREATED = 'social.comment_created';
export const COMMENT_DELETED = 'social.comment_deleted';
export const POST_REACTED = 'social.post_reacted';

export type PostCreatedEvent = DomainEvent<
  typeof POST_CREATED,
  { post_type: PostType; excerpt: string }
>;

/** `moderated` is true when someone other than the author removed it. */
export type PostDeletedEvent = DomainEvent<
  typeof POST_DELETED,
  { author_id: string; moderated: boolean }
>;

export type CommentCreatedEvent = DomainEvent<
  typeof COMMENT_CREATED,
  {
    post_id: string;
    post_author_id: string;
    parent_id: string | null;
    /** Author of the comment that was replied to. */
    parent_author_id: string | null;
    excerpt: string;
  }
>;

export type CommentDeletedEvent = DomainEvent<
  typeof COMMENT_DELETED,
  { post_id: string; author_id: string; moderated: boolean }
>;

/** `previous_reaction` is set when someone changed their reaction rather than adding one. */
export type PostReactedEvent = DomainEvent<
  typeof POST_REACTED,
  {
    post_id: string;
    post_author_id: string;
    reaction: ReactionType;
    previous_reaction: ReactionType | null;
  }
>;
