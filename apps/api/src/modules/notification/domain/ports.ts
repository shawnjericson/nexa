import type { Notification, NotificationDraft } from './notification';

/** Keyset position: (updated_at, id) of the last notification of the previous page. */
export interface NotificationCursor {
  updatedAt: Date;
  id: string;
}

export interface NotificationRepository {
  /**
   * Applies one event's drafts exactly once (risk register 12.2), coalescing unread drafts that
   * share a group key (12.3). Returns the stored notifications - none if the event was already
   * processed.
   */
  deliver(
    eventId: string,
    organizationId: string,
    drafts: NotificationDraft[],
  ): Promise<Notification[]>;
  /** Most recently active first. */
  list(
    organizationId: string,
    recipientId: string,
    options: { take: number; unreadOnly: boolean; after?: NotificationCursor },
  ): Promise<Notification[]>;
  countUnread(organizationId: string, recipientId: string): Promise<number>;
  /** Idempotent; returns null when the notification is not the recipient's. */
  markRead(
    organizationId: string,
    recipientId: string,
    id: string,
    at: Date,
  ): Promise<Notification | null>;
  markAllRead(organizationId: string, recipientId: string, at: Date): Promise<number>;
  /** Clears one coalesced group (e.g. every unread message of one conversation). */
  markGroupRead(
    organizationId: string,
    recipientId: string,
    groupKey: string,
    at: Date,
  ): Promise<number>;
}

/** Pushes stored notifications to the recipients' connected devices. */
export interface NotificationPusher {
  push(notifications: Notification[]): Promise<void>;
}
