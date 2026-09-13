import { z } from 'zod';
import { paginatedResponse, successResponse } from '../../../shared/http/openapi';
import { registerRoute } from '../../../shared/http/openapi-route';
import { UserReference } from '../../identity';
import {
  ConversationHit,
  MessageHit,
  OverviewQuery,
  OverviewResponse,
  PostHit,
  ScopedQuery,
} from './schemas';

const headers = z.object({
  'x-organization-id': z.uuid().optional().openapi({
    description: 'Active organization. Optional when you belong to exactly one organization.',
  }),
});

const TAG = 'Search';

const pagination = z.object({
  next_cursor: z.string().nullable(),
  has_next: z.boolean(),
  limit: z.number(),
});

registerRoute({
  method: 'get',
  path: '/api/v1/search',
  tag: TAG,
  summary: 'Search people, posts, conversations and messages',
  description:
    'The best few results of every kind. Only what you can already see is searched: members of ' +
    'your organization, its posts, its channels and your groups, and messages of conversations ' +
    'you are in.',
  headers,
  query: OverviewQuery,
  response: successResponse(OverviewResponse),
  errors: [400, 401, 403, 429],
});

const scopes = [
  ['people', 'People of your organization by name or username', UserReference],
  ['posts', 'Posts by content', PostHit],
  ['conversations', 'Channels and your groups by name or description', ConversationHit],
  ['messages', 'Messages of the conversations you are in', MessageHit],
] as const;

for (const [scope, summary, item] of scopes) {
  registerRoute({
    method: 'get',
    path: `/api/v1/search/${scope}`,
    tag: TAG,
    summary,
    description: 'Best match first. Pages up to 500 results deep.',
    headers,
    query: ScopedQuery,
    response: paginatedResponse(item, pagination),
    errors: [400, 401, 403, 429],
  });
}
