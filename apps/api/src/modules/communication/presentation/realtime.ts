import type { RealtimeHub } from '../../../infrastructure/websocket/realtime-hub';
import { userRoom } from '../../../infrastructure/websocket/rooms';
import type { UserDirectory } from '../../identity';
import type { Conversation, Message } from '../domain/conversation';
import type { ChatRealtime } from '../domain/ports';
import { toMessageResponse } from './dto';

/**
 * Server -> client chat events (spec §10). Events go to the personal rooms of the conversation's
 * *current* members, so someone who was just removed stops receiving immediately (ADR-015).
 */
export function createChatRealtime(deps: { hub: RealtimeHub; users: UserDirectory }): ChatRealtime {
  const { hub, users } = deps;
  const roomsOf = (conversation: Conversation, userIds: readonly string[]) =>
    userIds.map((userId) => userRoom(conversation.organizationId, userId));

  async function emitMessage(
    event: string,
    conversation: Conversation,
    recipientIds: readonly string[],
    message: Message,
  ) {
    const senders = await users.getSummaries([message.senderId]);
    hub.emit(roomsOf(conversation, recipientIds), event, toMessageResponse(message, senders));
  }

  return {
    messageCreated: (conversation, recipientIds, message) =>
      emitMessage('message.created', conversation, recipientIds, message),
    messageUpdated: (conversation, recipientIds, message) =>
      emitMessage('message.updated', conversation, recipientIds, message),
    messageDeleted: (conversation, recipientIds, message) =>
      emitMessage('message.deleted', conversation, recipientIds, message),

    async readUpdated(conversation, recipientIds, reader) {
      hub.emit(roomsOf(conversation, recipientIds), 'message.read', {
        conversation_id: conversation.id,
        user_id: reader.userId,
        last_read_seq: reader.lastReadSeq,
      });
    },

    async membersChanged(conversation, recipientIds, change) {
      hub.emit(roomsOf(conversation, recipientIds), 'conversation.members_changed', {
        conversation_id: conversation.id,
        type: conversation.type,
        added: change.added ?? [],
        removed: change.removed ?? [],
      });
    },
  };
}
