import type { DomainEvent } from '../../../shared/events/event-bus';
import type { PostType } from './content';

export const POST_CREATED = 'social.post_created';
export const COMMENT_CREATED = 'social.comment_created';

export type PostCreatedEvent = DomainEvent<typeof POST_CREATED, { post_type: PostType }>;

export type CommentCreatedEvent = DomainEvent<
  typeof COMMENT_CREATED,
  { post_id: string; post_author_id: string; parent_id: string | null }
>;
