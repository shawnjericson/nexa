import type { DomainEvent } from '../../../shared/events/event-bus';
import { decodeKeyset } from '../../../shared/utils/cursor';
import type { OrganizationActor } from '../../organization';
import type { Notification, NotificationDraft } from '../domain/notification';
import { NotificationErrors } from '../domain/notification-errors';
import type { NotificationPusher, NotificationRepository } from '../domain/ports';

export class NotificationService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      notifications: NotificationRepository;
      pusher: NotificationPusher;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Applies the drafts produced by one domain event. Nobody is notified about their own action,
   * and a failure here never affects the action itself (risk register 12.1).
   */
  async deliver(event: DomainEvent, drafts: NotificationDraft[]): Promise<void> {
    if (!event.organization_id) return;
    const relevant = drafts.filter((draft) => draft.recipientId !== event.actor_id);
    if (relevant.length === 0) return;

    const stored = await this.deps.notifications.deliver(event.id, event.organization_id, relevant);
    if (stored.length > 0) await this.deps.pusher.push(stored);
  }

  async list(
    actor: OrganizationActor,
    options: { limit: number; cursor?: string; unreadOnly: boolean },
  ): Promise<{ items: Notification[]; hasMore: boolean }> {
    const keyset = options.cursor ? decodeKeyset(options.cursor) : undefined;
    const rows = await this.deps.notifications.list(
      actor.organization.organizationId,
      actor.userId,
      {
        take: options.limit + 1,
        unreadOnly: options.unreadOnly,
        after: keyset && { updatedAt: keyset.at, id: keyset.id },
      },
    );
    return { items: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
  }

  unreadCount(actor: OrganizationActor): Promise<number> {
    return this.deps.notifications.countUnread(actor.organization.organizationId, actor.userId);
  }

  async markRead(actor: OrganizationActor, id: string): Promise<Notification> {
    const notification = await this.deps.notifications.markRead(
      actor.organization.organizationId,
      actor.userId,
      id,
      this.now(),
    );
    if (!notification) throw NotificationErrors.notFound();
    return notification;
  }

  markAllRead(actor: OrganizationActor): Promise<number> {
    return this.deps.notifications.markAllRead(
      actor.organization.organizationId,
      actor.userId,
      this.now(),
    );
  }
}
