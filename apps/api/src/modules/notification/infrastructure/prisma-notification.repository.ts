import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import {
  MAX_ACTORS,
  mergeActors,
  type Notification,
  type NotificationDraft,
} from '../domain/notification';
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

/** One draft per recipient and group: a statement can't update the same notification twice. */
function uniqueGroups(drafts: NotificationDraft[]): NotificationDraft[] {
  const byKey = new Map<string, NotificationDraft>();
  for (const draft of drafts) {
    if (draft.groupKey !== null) byKey.set(`${draft.recipientId}|${draft.groupKey}`, draft);
  }
  return [...byKey.values()];
}

/**
 * Adds each draft to the recipient's unread notification of the same group, or starts one - for
 * every recipient in two statements, however many there are. It used to be three queries per
 * recipient, inside the request that sent the message: seconds for a channel of a thousand.
 *
 * Coalescing is serialized per recipient and group (12.3) with advisory locks, all taken in one
 * statement and in a fixed order, so two events for overlapping people can't deadlock.
 */
async function coalesce(
  tx: Prisma.TransactionClient,
  organizationId: string,
  drafts: NotificationDraft[],
): Promise<NotificationRow[]> {
  const keys = drafts.map((draft) => `${draft.recipientId}|${draft.groupKey}`);
  // executeRaw: the locks return void, which a query result could not carry.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(h)
    FROM (SELECT hashtext(k) AS h FROM unnest(${keys}::text[]) AS k ORDER BY h) AS locks`;

  const now = new Date();
  const rows = JSON.stringify(
    drafts.map((draft) => ({
      recipient_id: draft.recipientId,
      actor_id: draft.actorId,
      type: draft.type,
      entity_type: draft.entityType,
      entity_id: draft.entityId,
      group_key: draft.groupKey,
      metadata: draft.metadata,
    })),
  );
  return tx.$queryRaw<NotificationRow[]>`
    WITH d AS (
      SELECT * FROM jsonb_to_recordset(${rows}::jsonb) AS d(
        recipient_id uuid, actor_id uuid, type text, entity_type text, entity_id uuid,
        group_key text, metadata jsonb)
    ),
    updated AS (
      UPDATE notifications n
         SET count = n.count + 1,
             actor_id = d.actor_id,
             updated_at = ${now},
             -- mergeActors: the newest actor first, then the earlier ones, at most MAX_ACTORS.
             metadata = n.metadata || d.metadata || jsonb_build_object('actor_ids', (
               SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb)
               FROM (
                 SELECT a, ord FROM (
                   SELECT d.actor_id::text AS a, 0::bigint AS ord WHERE d.actor_id IS NOT NULL
                   UNION ALL
                   SELECT e.a, e.ord
                   FROM jsonb_array_elements_text(
                          CASE WHEN jsonb_typeof(n.metadata -> 'actor_ids') = 'array'
                               THEN n.metadata -> 'actor_ids' ELSE '[]'::jsonb END
                        ) WITH ORDINALITY AS e(a, ord)
                   WHERE d.actor_id IS NULL OR e.a <> d.actor_id::text
                 ) AS merged
                 ORDER BY ord
                 LIMIT ${MAX_ACTORS}
               ) AS kept))
        FROM d
       WHERE n.organization_id = ${organizationId}::uuid
         AND n.recipient_id = d.recipient_id
         AND n.group_key = d.group_key
         AND n.read_at IS NULL
      RETURNING n.*
    ),
    inserted AS (
      INSERT INTO notifications (organization_id, recipient_id, actor_id, type, entity_type,
                                 entity_id, group_key, metadata, created_at, updated_at)
      SELECT ${organizationId}::uuid, d.recipient_id, d.actor_id, d.type, d.entity_type,
             d.entity_id, d.group_key,
             d.metadata || jsonb_build_object('actor_ids',
               CASE WHEN d.actor_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(d.actor_id) END),
             ${now}, ${now}
      FROM d
      WHERE NOT EXISTS (
        SELECT 1 FROM updated u WHERE u.recipient_id = d.recipient_id AND u.group_key = d.group_key)
      RETURNING *
    )
    SELECT id, organization_id AS "organizationId", recipient_id AS "recipientId",
           actor_id AS "actorId", type, entity_type AS "entityType", entity_id AS "entityId",
           group_key AS "groupKey", count, metadata, read_at AS "readAt",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM updated
    UNION ALL
    SELECT id, organization_id, recipient_id, actor_id, type, entity_type, entity_id, group_key,
           count, metadata, read_at, created_at, updated_at
    FROM inserted`;
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

        const grouped = uniqueGroups(drafts);
        if (grouped.length > 0) stored.push(...(await coalesce(tx, organizationId, grouped)));
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
