import type { RealtimeHub } from '../../../infrastructure/websocket/realtime-hub';
import { userRoom } from '../../../infrastructure/websocket/rooms';
import type { UserDirectory } from '../../identity';
import type { NotificationPusher } from '../domain/ports';
import { actorIdsOf, toNotificationResponse } from './dto';

/**
 * `notification.created` goes to every device of the recipient. A coalesced notification is sent
 * again with the same id, so clients simply upsert by id.
 */
export function createNotificationPusher(deps: {
  hub: RealtimeHub;
  users: UserDirectory;
}): NotificationPusher {
  return {
    async push(notifications) {
      const users = await deps.users.getSummaries(notifications.flatMap(actorIdsOf));
      for (const notification of notifications) {
        deps.hub.emit(
          userRoom(notification.organizationId, notification.recipientId),
          'notification.created',
          toNotificationResponse(notification, users),
        );
      }
    },
  };
}
