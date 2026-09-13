import { z } from 'zod';
import { paginatedResponse, successResponse } from '../../../shared/http/openapi';
import { registerRoute } from '../../../shared/http/openapi-route';
import { NotificationListQuery, NotificationParams, NotificationResponse } from './schemas';

const headers = z.object({
  'x-organization-id': z.uuid().optional().openapi({
    description: 'Active organization. Optional when you belong to exactly one organization.',
  }),
});

const TAG = 'Notifications';

registerRoute({
  method: 'get',
  path: '/api/v1/notifications',
  tag: TAG,
  summary: 'Your notifications, most recently active first',
  description:
    'Unread notifications of the same kind are coalesced (e.g. "Bob and 3 others reacted"), and ' +
    'new ones are also pushed as `notification.created` over WebSocket.',
  headers,
  query: NotificationListQuery,
  response: paginatedResponse(
    NotificationResponse,
    z.object({ next_cursor: z.string().nullable(), has_next: z.boolean(), limit: z.number() }),
  ),
  errors: [400, 401, 403],
});
registerRoute({
  method: 'get',
  path: '/api/v1/notifications/unread-count',
  tag: TAG,
  summary: 'Number of unread notifications',
  headers,
  response: successResponse(z.object({ unread_count: z.number().int() })),
  errors: [401, 403],
});
registerRoute({
  method: 'post',
  path: '/api/v1/notifications/read-all',
  tag: TAG,
  summary: 'Mark every notification as read',
  headers,
  response: successResponse(z.object({ marked_read: z.number().int() })),
  errors: [401, 403],
});
registerRoute({
  method: 'patch',
  path: '/api/v1/notifications/{id}/read',
  tag: TAG,
  summary: 'Mark one notification as read (idempotent)',
  headers,
  params: NotificationParams,
  response: successResponse(NotificationResponse),
  errors: [400, 401, 403, 404],
});
