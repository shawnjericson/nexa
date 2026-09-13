import type { RequestHandler, Router } from 'express';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../generated/prisma/client';
import { logger } from '../../infrastructure/logger/logger';
import type { RealtimeHub } from '../../infrastructure/websocket/realtime-hub';
import type { EventBus } from '../../shared/events/event-bus';
import type { Authenticate, UserDirectory } from '../identity';
import type { OrganizationDirectory, ResolveOrganizationContext } from '../organization';
import { ConversationService } from './application/conversation.service';
import { MessageService } from './application/message.service';
import { MemoryPresenceStore } from './infrastructure/memory-presence.store';
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
  type ConversationCreatedEvent,
  type MessageCreatedEvent,
} from './domain/events';

export interface CommunicationModule {
  /** Chat REST endpoints, mounted under /api/v1. */
  router: Router;
}

export function createCommunicationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  hub: RealtimeHub;
  /** Presence lives in Redis when available, otherwise in this process. */
  redis: Redis | null;
  users: UserDirectory;
  directory: OrganizationDirectory;
  authenticate: Authenticate;
  resolveContext: ResolveOrganizationContext;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
}): CommunicationModule {
  const conversationRepository = new PrismaConversationRepository(deps.prisma);
  const messageRepository = new PrismaMessageRepository(deps.prisma);
  const presence = deps.redis ? new RedisPresenceStore(deps.redis) : new MemoryPresenceStore();
  const realtime = createChatRealtime({ hub: deps.hub, users: deps.users });

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
      guard: deps.guard,
    }),
  };
}
