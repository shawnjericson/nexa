import { Router, type RequestHandler } from 'express';
import { validate } from '../../../shared/http/validate';
import type { UserDirectory } from '../../identity';
import type { NotificationService } from '../application/notification.service';
import { createNotificationController } from './notification.controller';
import { NotificationListQuery, NotificationParams } from './schemas';

/** In-app notifications of the caller (spec 16.6). Handlers: notification.controller.ts. */
export function createNotificationRouter(deps: {
  notifications: NotificationService;
  users: UserDirectory;
  guard: RequestHandler[];
}): Router {
  const { guard } = deps;
  const controller = createNotificationController(deps);

  const router = Router();
  router.get(
    '/notifications',
    ...guard,
    validate({ query: NotificationListQuery }),
    controller.list,
  );
  router.get('/notifications/unread-count', ...guard, controller.unreadCount);
  router.post('/notifications/read-all', ...guard, controller.markAllRead);
  router.patch(
    '/notifications/:id/read',
    ...guard,
    validate({ params: NotificationParams }),
    controller.markRead,
  );
  return router;
}
