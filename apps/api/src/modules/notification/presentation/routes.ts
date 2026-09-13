import { Router, type Request, type RequestHandler } from 'express';
import { ok, paginated } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { encodeKeyset } from '../../../shared/utils/cursor';
import { requireAuthContext, type UserDirectory } from '../../identity';
import { organizationContext, type OrganizationActor } from '../../organization';
import type { NotificationService } from '../application/notification.service';
import type { Notification } from '../domain/notification';
import { actorIdsOf, toNotificationResponse } from './dto';
import {
  NotificationListQuery,
  NotificationParams,
  type NotificationListQueryInput,
} from './schemas';

/** In-app notifications of the caller in the active organization (spec 16.6). */
export function createNotificationRouter(deps: {
  notifications: NotificationService;
  users: UserDirectory;
  guard: RequestHandler[];
}): Router {
  const { notifications, users, guard } = deps;

  const actorOf = (req: Request): OrganizationActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });

  async function present(items: Notification[]) {
    const directory = await users.getSummaries(items.flatMap(actorIdsOf));
    return items.map((item) => toNotificationResponse(item, directory));
  }

  const list: RequestHandler = async (req, res) => {
    const query = req.query as unknown as NotificationListQueryInput;
    const page = await notifications.list(actorOf(req), {
      limit: query.limit,
      cursor: query.cursor,
      unreadOnly: query.unread_only,
    });
    const last = page.items.at(-1);
    paginated(res, await present(page.items), {
      next_cursor: page.hasMore && last ? encodeKeyset({ at: last.updatedAt, id: last.id }) : null,
      has_next: page.hasMore,
      limit: query.limit,
    });
  };

  const unreadCount: RequestHandler = async (req, res) => {
    ok(res, { unread_count: await notifications.unreadCount(actorOf(req)) });
  };

  const markRead: RequestHandler = async (req, res) => {
    const { id } = req.params as { id: string };
    const [response] = await present([await notifications.markRead(actorOf(req), id)]);
    ok(res, response);
  };

  const markAllRead: RequestHandler = async (req, res) => {
    ok(res, { marked_read: await notifications.markAllRead(actorOf(req)) });
  };

  const router = Router();
  router.get('/notifications', ...guard, validate({ query: NotificationListQuery }), list);
  router.get('/notifications/unread-count', ...guard, unreadCount);
  router.post('/notifications/read-all', ...guard, markAllRead);
  router.patch(
    '/notifications/:id/read',
    ...guard,
    validate({ params: NotificationParams }),
    markRead,
  );
  return router;
}
