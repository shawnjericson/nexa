import type { RequestHandler, Router } from 'express';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../generated/prisma/client';
import { logger } from '../../infrastructure/logger/logger';
import type { RealtimeHub } from '../../infrastructure/websocket/realtime-hub';
import type { EventBus } from '../../shared/events/event-bus';
import type { FileDirectory } from '../file';
import type { Authenticate, UserDirectory } from '../identity';
import type { OrganizationDirectory, ResolveOrganizationContext } from '../organization';
import { ConversationService } from './application/conversation.service';
import { MessageService } from './application/message.service';
import type { ChatSearch } from './domain/search';
import { MemoryPresenceStore } from './infrastructure/memory-presence.store';
import { PrismaChatSearch } from './infrastructure/prisma-chat-search';
import { PrismaConversationRepository } from './infrastructure/prisma-conversation.repository';
import { PrismaMessageRepository } from './infrastructure/prisma-message.repository';
import { RedisPresenceStore } from './infrastructure/redis-presence.store';
import './presentation/openapi';
import { createChatRealtime } from './presentation/realtime';
import { createCommunicationRouter } from './presentation/routes';
import { registerChatSockets } from './presentation/socket';

// Public contract of the Communication module.
export {
  CONVERSATION_CREATED,
  MESSAGE_CREATED,
  MESSAGE_DELETED,
  type ConversationCreatedEvent,
  type MessageCreatedEvent,
  type MessageDeletedEvent,
} from './domain/events';
export type { ChatSearch, ConversationSearchHit, MessageSearchHit } from './domain/search';

export interface CommunicationModule {
  /** Chat REST endpoints, mounted under /api/v1. */
  router: Router;
  /** Conversation and message search for the Search module, with chat's access rules. */
  search: ChatSearch;
}

export function createCommunicationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  hub: RealtimeHub;
  /** Presence lives in Redis when available, otherwise in this process. */
  redis: Redis | null;
  users: UserDirectory;
  directory: OrganizationDirectory;
  /** The File module's contract, used to attach and show files. */
  files: FileDirectory;
  authenticate: Authenticate;
  resolveContext: ResolveOrganizationContext;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
}): CommunicationModule {
  const conversationRepository = new PrismaConversationRepository(deps.prisma);
  const messageRepository = new PrismaMessageRepository(deps.prisma);
  const presence = deps.redis ? new RedisPresenceStore(deps.redis) : new MemoryPresenceStore();
  const realtime = createChatRealtime({ hub: deps.hub, users: deps.users, files: deps.files });

  const conversations = new ConversationService({
    conversations: conversationRepository,
    messages: messageRepository,
    directory: deps.directory,
    realtime,
    events: deps.events,
  });
  const messages = new MessageService({
    conversationService: conversations,
    conversations: conversationRepository,
    messages: messageRepository,
    files: deps.files,
    realtime,
    events: deps.events,
  });

  registerChatSockets(deps.hub, {
    authenticate: deps.authenticate,
    resolveContext: deps.resolveContext,
    users: deps.users,
    conversations: conversationRepository,
    presence,
    logger,
  });

  return {
    router: createCommunicationRouter({
      conversations,
      messages,
      presence,
      users: deps.users,
      files: deps.files,
      guard: deps.guard,
    }),
    search: new PrismaChatSearch(deps.prisma),
  };
}
