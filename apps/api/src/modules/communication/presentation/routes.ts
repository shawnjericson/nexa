import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { validate } from '../../../shared/http/validate';
import type { FileDirectory } from '../../file';
import type { UserDirectory } from '../../identity';
import type { ConversationService } from '../application/conversation.service';
import type { MessageService } from '../application/message.service';
import type { PresenceStore } from '../domain/ports';
import { createChatController } from './chat.controller';
import {
  AddMembersBody,
  ConversationListQuery,
  ConversationMemberParams,
  ConversationParams,
  CreateConversationBody,
  EditMessageBody,
  HistoryQuery,
  MarkReadBody,
  MessageParams,
  PresenceQuery,
  SendMessageBody,
  UpdateConversationBody,
} from './schemas';

/**
 * Chat endpoints, mounted under /api/v1. Messages are created here; delivery is realtime.
 * The handlers are in chat.controller.ts.
 */
export function createCommunicationRouter(deps: {
  conversations: ConversationService;
  messages: MessageService;
  presence: PresenceStore;
  users: UserDirectory;
  /** Shows attachments; access follows conversation membership. */
  files: FileDirectory;
  /** requireAuth + requireOrganization, applied per route so unknown paths still 404. */
  guard: RequestHandler[];
}): Router {
  const { guard } = deps;
  const controller = createChatController(deps);
  const createLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });
  const sendLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 });

  const router = Router();
  const conversation = '/conversations/:id';

  router.get(
    '/conversations',
    ...guard,
    validate({ query: ConversationListQuery }),
    controller.listConversations,
  );
  router.post(
    '/conversations',
    createLimiter,
    ...guard,
    validate({ body: CreateConversationBody }),
    controller.createConversation,
  );
  router.get(
    conversation,
    ...guard,
    validate({ params: ConversationParams }),
    controller.getConversation,
  );
  router.patch(
    conversation,
    ...guard,
    validate({ params: ConversationParams, body: UpdateConversationBody }),
    controller.updateConversation,
  );
  router.post(
    `${conversation}/members`,
    ...guard,
    validate({ params: ConversationParams, body: AddMembersBody }),
    controller.addMembers,
  );
  router.delete(
    `${conversation}/members/:userId`,
    ...guard,
    validate({ params: ConversationMemberParams }),
    controller.removeMember,
  );
  router.get(
    `${conversation}/messages`,
    ...guard,
    validate({ params: ConversationParams, query: HistoryQuery }),
    controller.history,
  );
  router.post(
    `${conversation}/messages`,
    sendLimiter,
    ...guard,
    validate({ params: ConversationParams, body: SendMessageBody }),
    controller.sendMessage,
  );
  router.patch(
    `${conversation}/messages/:messageId`,
    ...guard,
    validate({ params: MessageParams, body: EditMessageBody }),
    controller.editMessage,
  );
  router.delete(
    `${conversation}/messages/:messageId`,
    ...guard,
    validate({ params: MessageParams }),
    controller.deleteMessage,
  );
  router.post(
    `${conversation}/read`,
    ...guard,
    validate({ params: ConversationParams, body: MarkReadBody }),
    controller.markRead,
  );
  router.get('/channels', ...guard, controller.listChannels);
  router.get('/presence', ...guard, validate({ query: PresenceQuery }), controller.getPresence);
  router.get('/presence/online-count', ...guard, controller.getOnlineCount);

  return router;
}
