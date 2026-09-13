import { z } from 'zod';
import { paginatedResponse, successResponse } from '../../../shared/http/openapi';
import { registerRoute } from '../../../shared/http/openapi-route';
import {
  AddMembersBody,
  ChannelResponse,
  ConversationDetailsResponse,
  ConversationListQuery,
  ConversationMemberParams,
  ConversationParams,
  ConversationSummaryResponse,
  CreateConversationBody,
  EditMessageBody,
  HistoryQuery,
  MarkReadBody,
  MessageParams,
  MessageResponse,
  SendMessageBody,
  UpdateConversationBody,
} from './schemas';

const headers = z.object({
  'x-organization-id': z.uuid().optional().openapi({
    description: 'Active organization. Optional when you belong to exactly one organization.',
  }),
});

const CHAT = 'Chat';
const conversation = '/api/v1/conversations/{id}';

registerRoute({
  method: 'get',
  path: '/api/v1/conversations',
  tag: CHAT,
  summary: 'Your conversations, most recently active first, with unread counts',
  headers,
  query: ConversationListQuery,
  response: paginatedResponse(
    ConversationSummaryResponse,
    z.object({ next_cursor: z.string().nullable(), has_next: z.boolean(), limit: z.number() }),
  ),
  errors: [400, 401, 403],
});
registerRoute({
  method: 'post',
  path: '/api/v1/conversations',
  tag: CHAT,
  summary: 'Open a direct conversation, or create a group or channel',
  description:
    'DIRECT is idempotent: 201 when created, 200 with the existing conversation otherwise. ' +
    'CHANNEL needs the channel.create permission.',
  headers,
  body: CreateConversationBody,
  status: 201,
  response: successResponse(ConversationDetailsResponse),
  errors: [400, 401, 403, 404, 409, 429],
});
registerRoute({
  method: 'get',
  path: conversation,
  tag: CHAT,
  summary: 'Conversation with its members and their read positions',
  description: 'Direct and group conversations you are not in answer 404 - admins included.',
  headers,
  params: ConversationParams,
  response: successResponse(ConversationDetailsResponse),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'patch',
  path: conversation,
  tag: CHAT,
  summary: 'Rename, describe or archive a group or channel (owners and admins)',
  headers,
  params: ConversationParams,
  body: UpdateConversationBody,
  response: successResponse(ConversationDetailsResponse),
  errors: [400, 401, 403, 404, 409],
});
registerRoute({
  method: 'post',
  path: `${conversation}/members`,
  tag: CHAT,
  summary: 'Add members (owners/admins), or join a channel by adding yourself',
  headers,
  params: ConversationParams,
  body: AddMembersBody,
  response: successResponse(ConversationDetailsResponse),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'delete',
  path: `${conversation}/members/{userId}`,
  tag: CHAT,
  summary: 'Leave, or remove someone (owners/admins)',
  headers,
  params: ConversationMemberParams,
  response: successResponse(
    z.object({ conversation_id: z.uuid(), user_id: z.uuid(), removed: z.literal(true) }),
  ),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'get',
  path: `${conversation}/messages`,
  tag: CHAT,
  summary: 'Message history, ascending by seq',
  description:
    'Without parameters: the newest page. `before_seq` scrolls back; `after_seq` catches up ' +
    'after a reconnect.',
  headers,
  params: ConversationParams,
  query: HistoryQuery,
  response: paginatedResponse(
    MessageResponse,
    z.object({ has_more: z.boolean(), limit: z.number() }),
  ),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'post',
  path: `${conversation}/messages`,
  tag: CHAT,
  summary: 'Send a message (idempotent per client_message_id)',
  description:
    '201 for a new message, delivered as `message.created` over WebSocket. A retry with the same ' +
    'client_message_id answers 200 with the original message.',
  headers,
  params: ConversationParams,
  body: SendMessageBody,
  status: 201,
  response: successResponse(MessageResponse),
  errors: [400, 401, 403, 404, 409, 429],
});
registerRoute({
  method: 'patch',
  path: `${conversation}/messages/{messageId}`,
  tag: CHAT,
  summary: 'Edit your message',
  headers,
  params: MessageParams,
  body: EditMessageBody,
  response: successResponse(MessageResponse),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'delete',
  path: `${conversation}/messages/{messageId}`,
  tag: CHAT,
  summary: 'Delete a message, leaving a tombstone',
  headers,
  params: MessageParams,
  response: successResponse(MessageResponse),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'post',
  path: `${conversation}/read`,
  tag: CHAT,
  summary: 'Mark messages up to seq as read (never moves backwards)',
  headers,
  params: ConversationParams,
  body: MarkReadBody,
  response: successResponse(z.object({ conversation_id: z.uuid(), last_read_seq: z.number() })),
  errors: [400, 401, 403, 404],
});
registerRoute({
  method: 'get',
  path: '/api/v1/channels',
  tag: CHAT,
  summary: 'Every channel of the organization, and whether you joined it',
  headers,
  response: successResponse(z.array(ChannelResponse)),
  errors: [401, 403],
});
registerRoute({
  method: 'get',
  path: '/api/v1/presence',
  tag: CHAT,
  summary: 'Online status of people in the organization',
  headers,
  query: z.object({ user_ids: z.string().openapi({ description: 'Comma-separated user ids' }) }),
  response: successResponse(z.record(z.string(), z.enum(['online', 'offline']))),
  errors: [400, 401, 403],
});
