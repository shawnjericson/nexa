import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { ChatErrors } from '../domain/chat-errors';
import type { Message } from '../domain/conversation';
import { MESSAGE_CREATED, type MessageCreatedEvent } from '../domain/events';
import { canDeleteMessage, canEditMessage, type ChatActor } from '../domain/policies';
import type { ChatRealtime, ConversationRepository, MessageRepository } from '../domain/ports';
import type { ConversationService } from './conversation.service';

export class MessageService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      conversationService: ConversationService;
      conversations: ConversationRepository;
      messages: MessageRepository;
      realtime: ChatRealtime;
      events: EventBus;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Persists first, then delivers in realtime. A retry with the same client_message_id returns the
   * original message with `created: false` and is not delivered again (risk register 9.1, 9.3).
   */
  async send(
    actor: ChatActor,
    conversationId: string,
    input: { content: string; clientMessageId: string; replyToId?: string },
  ): Promise<{ message: Message; created: boolean }> {
    const { conversation } = await this.deps.conversationService.requireMember(
      actor,
      conversationId,
    );
    if (conversation.archivedAt) throw ChatErrors.conversationArchived();
    if (input.replyToId && !(await this.deps.messages.findById(conversation.id, input.replyToId))) {
      throw ChatErrors.replyTargetNotFound();
    }

    const result = await this.deps.messages.append(
      {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        senderId: actor.userId,
        clientMessageId: input.clientMessageId,
        type: 'TEXT',
        content: input.content,
        replyToId: input.replyToId ?? null,
      },
      this.now(),
    );

    if (result.created) {
      const memberIds = await this.deps.conversations.listMemberIds(conversation.id);
      await this.deps.realtime.messageCreated(conversation, memberIds, result.message);
      const event: MessageCreatedEvent = createEvent(MESSAGE_CREATED, {
        organization_id: conversation.organizationId,
        actor_id: actor.userId,
        subject_id: result.message.id,
        metadata: {
          conversation_id: conversation.id,
          conversation_type: conversation.type,
          seq: result.message.seq,
          recipient_ids: memberIds.filter((id) => id !== actor.userId),
        },
      });
      await this.deps.events.publish(event);
    }
    return result;
  }

  async history(
    actor: ChatActor,
    conversationId: string,
    options: { beforeSeq?: number; afterSeq?: number; limit: number },
  ): Promise<{ items: Message[]; hasMore: boolean }> {
    const { conversation } = await this.deps.conversationService.requireMember(
      actor,
      conversationId,
    );
    return this.deps.messages.list(conversation.id, options);
  }

  async edit(
    actor: ChatActor,
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<Message> {
    const { conversation } = await this.deps.conversationService.requireMember(
      actor,
      conversationId,
    );
    const message = await this.deps.messages.findById(conversation.id, messageId);
    if (!message || message.deletedAt) throw ChatErrors.messageNotFound();
    if (!canEditMessage(actor, message)) throw ChatErrors.messageEditForbidden();

    const updated = await this.deps.messages.edit(conversation.id, message.id, content, this.now());
    if (!updated) throw ChatErrors.messageNotFound();
    await this.deps.realtime.messageUpdated(
      conversation,
      await this.deps.conversations.listMemberIds(conversation.id),
      updated,
    );
    return updated;
  }

  /** Keeps a tombstone in the history (risk register 9.7). */
  async delete(actor: ChatActor, conversationId: string, messageId: string): Promise<Message> {
    const { conversation, membership } = await this.deps.conversationService.requireMember(
      actor,
      conversationId,
    );
    const message = await this.deps.messages.findById(conversation.id, messageId);
    if (!message || message.deletedAt) throw ChatErrors.messageNotFound();
    if (!canDeleteMessage(actor, conversation, membership, message)) {
      throw ChatErrors.messageDeleteForbidden();
    }

    const deleted = await this.deps.messages.softDelete(conversation.id, message.id, this.now());
    if (!deleted) throw ChatErrors.messageNotFound();
    await this.deps.realtime.messageDeleted(
      conversation,
      await this.deps.conversations.listMemberIds(conversation.id),
      deleted,
    );
    return deleted;
  }
}
