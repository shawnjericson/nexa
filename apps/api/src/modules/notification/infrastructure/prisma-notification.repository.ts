import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { mergeActors, type Notification, type NotificationDraft } from '../domain/notification';
import type { NotificationCursor, NotificationRepository } from '../domain/ports';

const CONSUMER = 'notification';

const NOTIFICATION_SELECT = {
  id: true,
  organizationId: true,
  recipientId: true,
  actorId: true,
  type: true,
  entityType: true,
  entityId: true,
  groupKey: true,
  count: true,
  metadata: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNotification(row: NotificationRow): Notification {
  return { ...row, metadata: isRecord(row.metadata) ? row.metadata : {} };
}

function toCreateInput(organizationId: string, draft: NotificationDraft) {
  return {
    organizationId,
    recipientId: draft.recipientId,
    actorId: draft.actorId,
    type: draft.type,
    entityType: draft.entityType,
    entityId: draft.entityId,
    groupKey: draft.groupKey,
    metadata: {
      ...draft.metadata,
      actor_ids: mergeActors([], draft.actorId),
    } as Prisma.InputJsonObject,
  };
}

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  deliver(
    eventId: string,
    organizationId: string,
    drafts: NotificationDraft[],
  ): Promise<Notification[]> {
    return this.prisma.$transaction(
      async (tx) => {
        // Idempotent consumer: however often an event arrives, it is applied once (12.2).
        const receipt = await tx.processedEvent.createMany({
          data: [{ consumer: CONSUMER, eventId }],
          skipDuplicates: true,
        });
        if (receipt.count === 0) return [];

        const stored: NotificationRow[] = [];

        const standalone = drafts.filter((draft) => draft.groupKey === null);
        if (standalone.length > 0) {
          stored.push(
            ...(await tx.notification.createManyAndReturn({
              data: standalone.map((draft) => toCreateInput(organizationId, draft)),
              select: NOTIFICATION_SELECT,
            })),
          );
        }

        for (const draft of drafts.filter((d) => d.groupKey !== null)) {
          // Serialize coalescing per recipient and group, so concurrent events can't split one
          // notification into two (12.3).
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${draft.recipientId}|${draft.groupKey}`}))`;
          const existing = await tx.notification.findFirst({
            where: {
              organizationId,
              recipientId: draft.recipientId,
              groupKey: draft.groupKey,
              readAt: null,
            },
            select: NOTIFICATION_SELECT,
          });

          if (!existing) {
            stored.push(
              await tx.notification.create({
                data: toCreateInput(organizationId, draft),
                select: NOTIFICATION_SELECT,
              }),
            );
            continue;
          }

          const previous = isRecord(existing.metadata) ? existing.metadata : {};
          stored.push(
            await tx.notification.update({
              where: { id: existing.id },
              data: {
                count: { increment: 1 },
                actorId: draft.actorId,
                updatedAt: new Date(),
                metadata: {
                  ...previous,
                  ...draft.metadata,
                  actor_ids: mergeActors(previous.actor_ids, draft.actorId),
                } as Prisma.InputJsonObject,
              },
              select: NOTIFICATION_SELECT,
            }),
          );
        }
        return stored.map(toNotification);
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  async list(
    organizationId: string,
    recipientId: string,
    { take, unreadOnly, after }: { take: number; unreadOnly: boolean; after?: NotificationCursor },
  ): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        organizationId,
        recipientId,
        ...(unreadOnly && { readAt: null }),
        // (updated_at, id) < (cursor.updatedAt, cursor.id)
        ...(after && {
          OR: [
            { updatedAt: { lt: after.updatedAt } },
            { updatedAt: after.updatedAt, id: { lt: after.id } },
          ],
        }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
      select: NOTIFICATION_SELECT,
    });
    return rows.map(toNotification);
  }

  countUnread(organizationId: string, recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { organizationId, recipientId, readAt: null },
    });
  }

  async markRead(
    organizationId: string,
    recipientId: string,
    id: string,
    at: Date,
  ): Promise<Notification | null> {
    await this.prisma.notification.updateMany({
      where: { id, organizationId, recipientId, readAt: null },
      data: { readAt: at },
    });
    const row = await this.prisma.notification.findFirst({
      where: { id, organizationId, recipientId },
      select: NOTIFICATION_SELECT,
    });
    return row && toNotification(row);
  }

  async markAllRead(organizationId: string, recipientId: string, at: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { organizationId, recipientId, readAt: null },
      data: { readAt: at },
    });
    return count;
  }

  async markGroupRead(
    organizationId: string,
    recipientId: string,
    groupKey: string,
    at: Date,
  ): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { organizationId, recipientId, groupKey, readAt: null },
      data: { readAt: at },
    });
    return count;
  }
}
