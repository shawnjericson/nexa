import { z } from 'zod';
import '../../../shared/http/openapi';
import { UserReference } from '../../identity';

export const NotificationListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(512).optional(),
  unread_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const NotificationParams = z.object({ id: z.uuid() });

export const NotificationResponse = z
  .object({
    id: z.uuid(),
    type: z.string().openapi({ example: 'post.commented' }),
    entity_type: z.string().openapi({ example: 'post' }),
    entity_id: z.uuid(),
    actor: UserReference.nullable().openapi({
      description: 'Latest person who caused it; null when they are gone',
    }),
    actors: z.array(UserReference).openapi({ description: 'Up to 3 most recent distinct actors' }),
    count: z.number().int().openapi({ description: 'Events coalesced into this notification' }),
    metadata: z.record(z.string(), z.unknown()),
    read: z.boolean(),
    read_at: z.iso.datetime().nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('Notification');

export type NotificationListQueryInput = z.infer<typeof NotificationListQuery>;
