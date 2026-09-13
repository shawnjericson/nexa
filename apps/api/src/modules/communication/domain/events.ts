import type { DomainEvent } from '../../../shared/events/event-bus';
import type { ConversationType } from './conversation';

export const CONVERSATION_CREATED = 'communication.conversation_created';
export const MESSAGE_CREATED = 'communication.message_created';
export const MESSAGE_DELETED = 'communication.message_deleted';

export type ConversationCreatedEvent = DomainEvent<
  typeof CONVERSATION_CREATED,
  { type: ConversationType; member_ids: string[] }
>;

/** Consumed by notifications; recipients exclude the sender. */
export type MessageCreatedEvent = DomainEvent<
  typeof MESSAGE_CREATED,
  {
    conversation_id: string;
    conversation_type: ConversationType;
    seq: number;
    recipient_ids: string[];
    /** Empty when the message only carries attachments. */
    excerpt: string;
    attachment_count: number;
  }
>;

/** `moderated` is true when someone other than the sender deleted it. */
export type MessageDeletedEvent = DomainEvent<
  typeof MESSAGE_DELETED,
  {
    conversation_id: string;
    conversation_type: ConversationType;
    sender_id: string;
    moderated: boolean;
  }
>;
