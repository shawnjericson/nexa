import { toUserReference, type UserSummary } from '../../identity';
import type { Notification } from '../domain/notification';

/** Latest actor first, then the other recent distinct actors. */
export function actorIdsOf(notification: Notification): string[] {
  const listed = Array.isArray(notification.metadata.actor_ids)
    ? notification.metadata.actor_ids.filter((id): id is string => typeof id === 'string')
    : [];
  const { actorId } = notification;
  return actorId ? [actorId, ...listed.filter((id) => id !== actorId)] : listed;
}

/** Deactivated or removed actors still resolve ("a former member", risk register 12.4). */
export function toNotificationResponse(
  notification: Notification,
  users: ReadonlyMap<string, UserSummary>,
) {
  const { actor_ids: _actorIds, ...metadata } = notification.metadata;
  const actors = actorIdsOf(notification)
    .map((id) => toUserReference(users.get(id)))
    .filter((actor) => actor !== null);
  return {
    id: notification.id,
    type: notification.type,
    entity_type: notification.entityType,
    entity_id: notification.entityId,
    actor: notification.actorId ? toUserReference(users.get(notification.actorId)) : null,
    actors,
    count: notification.count,
    metadata,
    read: notification.readAt !== null,
    read_at: notification.readAt?.toISOString() ?? null,
    created_at: notification.createdAt.toISOString(),
    updated_at: notification.updatedAt.toISOString(),
  };
}
