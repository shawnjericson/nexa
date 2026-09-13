export type NotificationType =
  | 'post.commented'
  | 'comment.replied'
  | 'post.reacted'
  | 'announcement.published'
  | 'message.received'
  | 'member.role_changed';

export interface Notification {
  id: string;
  organizationId: string;
  recipientId: string;
  /** The latest person who caused it; null for system notifications. */
  actorId: string | null;
  type: string;
  entityType: string;
  entityId: string;
  groupKey: string | null;
  /** How many events were coalesced into this notification. */
  count: number;
  metadata: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A notification to deliver. Unread notifications with the same groupKey are coalesced. */
export interface NotificationDraft {
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  entityType: string;
  entityId: string;
  groupKey: string | null;
  metadata: Record<string, unknown>;
}

/** Most recent distinct actors kept on a coalesced notification ("Bob, An and 3 others"). */
export const MAX_ACTORS = 3;

export function mergeActors(previous: unknown, actorId: string | null): string[] {
  const known = Array.isArray(previous)
    ? previous.filter((id): id is string => typeof id === 'string')
    : [];
  const merged = actorId ? [actorId, ...known.filter((id) => id !== actorId)] : known;
  return merged.slice(0, MAX_ACTORS);
}
