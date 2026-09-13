import type { RequestHandler, Router } from 'express';
import type { PrismaClient } from '../../generated/prisma/client';
import type { RealtimeHub } from '../../infrastructure/websocket/realtime-hub';
import type { EventBus } from '../../shared/events/event-bus';
import type { UserDirectory } from '../identity';
import type { OrganizationDirectory } from '../organization';
import { registerNotificationRules } from './application/notification-rules';
import { NotificationService } from './application/notification.service';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository';
import './presentation/openapi';
import { createNotificationPusher } from './presentation/realtime';
import { createNotificationRouter } from './presentation/routes';

export interface NotificationModule {
  /** Notification endpoints, mounted under /api/v1. */
  router: Router;
}

/** Listens to other modules' domain events; nothing depends on this module (spec §5). */
export function createNotificationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  hub: RealtimeHub;
  users: UserDirectory;
  directory: OrganizationDirectory;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
}): NotificationModule {
  const notifications = new NotificationService({
    notifications: new PrismaNotificationRepository(deps.prisma),
    pusher: createNotificationPusher({ hub: deps.hub, users: deps.users }),
  });
  registerNotificationRules(deps.events, notifications, deps.directory);

  return {
    router: createNotificationRouter({ notifications, users: deps.users, guard: deps.guard }),
  };
}
