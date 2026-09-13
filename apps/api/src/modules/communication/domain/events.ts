import type { DomainEvent } from '../../../shared/events/event-bus';
import type { ConversationType } from './conversation';

export const CONVERSATION_CREATED = 'communication.conversation_created';
export const MESSAGE_CREATED = 'communication.message_created';

export type ConversationCreatedEvent = DomainEvent<
  typeof CONVERSATION_CREATED,
  { type: ConversationType; member_ids: string[] }
>;

/** Consumed by notifications later; recipients exclude the sender. */
export type MessageCreatedEvent = DomainEvent<
  typeof MESSAGE_CREATED,
  {
    conversation_id: string;
    conversation_type: ConversationType;
    seq: number;
    recipient_ids: string[];
  }
>;
