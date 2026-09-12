import { z } from 'zod';
import {
  bearerAuth,
  errorResponses,
  jsonContent,
  paginatedResponse,
  registry,
  successResponse,
} from '../../../shared/http/openapi';
import {
  CommentResponse,
  CreateCommentBody,
  CreatePostBody,
  CursorPagination,
  CursorQuery,
  Deleted,
  ExamPostIdParams,
  IdParams,
  PagePagination,
  PageQuery,
  PostResponse,
  ReactBody,
  Reactions,
  UpdatePostBody,
} from './schemas';

const OrganizationHeader = z.object({
  'x-organization-id': z.uuid().optional().openapi({
    description: 'Active organization. Optional when you belong to exactly one organization.',
  }),
});

const tenant = { security: bearerAuth };

registry.registerPath({
  method: 'get',
  path: '/api/v1/feed',
  tags: ['Feed'],
  summary: 'Organization feed, newest first',
  description:
    'Cursor pagination on (created_at, id): posts created while scrolling never shift or ' +
    'duplicate later pages. Pass `pagination.next_cursor` as `cursor` for the next page.',
  ...tenant,
  request: { headers: OrganizationHeader, query: CursorQuery },
  responses: {
    200: {
      description: 'A page of posts',
      content: jsonContent(paginatedResponse(PostResponse, CursorPagination)),
    },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/posts',
  tags: ['Exam contract'],
  summary: 'Feed with page/limit pagination (exam)',
  ...tenant,
  request: { headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'A page of posts',
      content: jsonContent(paginatedResponse(PostResponse, PagePagination)),
    },
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/posts',
  tags: ['Posts'],
  summary: 'Create a post in the active organization',
  description: 'Also served as POST /api/posts (exam contract).',
  ...tenant,
  request: { headers: OrganizationHeader, body: { content: jsonContent(CreatePostBody) } },
  responses: {
    201: { description: 'Post created', content: jsonContent(successResponse(PostResponse)) },
    ...errorResponses(400, 401, 403, 429),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/posts/{id}',
  tags: ['Posts'],
  summary: 'Post with its author and reactions',
  description: 'Posts of other organizations answer 404. Also served as GET /api/posts/{id}.',
  ...tenant,
  request: { headers: OrganizationHeader, params: IdParams },
  responses: {
    200: { description: 'Post', content: jsonContent(successResponse(PostResponse)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/posts/{id}',
  tags: ['Posts'],
  summary: 'Edit a post (author only)',
  description: 'Also served as PUT /api/posts/{id}.',
  ...tenant,
  request: {
    headers: OrganizationHeader,
    params: IdParams,
    body: { content: jsonContent(UpdatePostBody) },
  },
  responses: {
    200: { description: 'Updated post', content: jsonContent(successResponse(PostResponse)) },
    ...errorResponses(400, 401, 403, 404, 429),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/posts/{id}',
  tags: ['Posts'],
  summary: 'Delete a post (author or moderator)',
  description: 'Soft delete. Also served as DELETE /api/posts/{id}.',
  ...tenant,
  request: { headers: OrganizationHeader, params: IdParams },
  responses: {
    200: { description: 'Deleted', content: jsonContent(successResponse(Deleted)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/posts/{id}/reactions',
  tags: ['Reactions'],
  summary: 'React to a post (one reaction per person; reacting again replaces it)',
  ...tenant,
  request: {
    headers: OrganizationHeader,
    params: IdParams,
    body: { content: jsonContent(ReactBody) },
  },
  responses: {
    200: { description: 'Reactions of the post', content: jsonContent(successResponse(Reactions)) },
    ...errorResponses(400, 401, 403, 404, 429),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/posts/{id}/reactions',
  tags: ['Reactions'],
  summary: 'Remove your reaction (idempotent)',
  ...tenant,
  request: { headers: OrganizationHeader, params: IdParams },
  responses: {
    200: { description: 'Reactions of the post', content: jsonContent(successResponse(Reactions)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/posts/{id}/comments',
  tags: ['Comments'],
  summary: 'Comments of a post, oldest first',
  ...tenant,
  request: { headers: OrganizationHeader, params: IdParams, query: CursorQuery },
  responses: {
    200: {
      description: 'A page of comments',
      content: jsonContent(paginatedResponse(CommentResponse, CursorPagination)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/comments/post/{postId}',
  tags: ['Exam contract'],
  summary: 'Comments of a post with page/limit pagination (exam)',
  ...tenant,
  request: { headers: OrganizationHeader, params: ExamPostIdParams, query: PageQuery },
  responses: {
    200: {
      description: 'A page of comments',
      content: jsonContent(paginatedResponse(CommentResponse, PagePagination)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/posts/{id}/comments',
  tags: ['Comments'],
  summary: 'Comment on a post or reply to a comment',
  description: 'Also served as POST /api/comments/post/{postId} (exam contract).',
  ...tenant,
  request: {
    headers: OrganizationHeader,
    params: IdParams,
    body: { content: jsonContent(CreateCommentBody) },
  },
  responses: {
    201: { description: 'Comment created', content: jsonContent(successResponse(CommentResponse)) },
    ...errorResponses(400, 401, 403, 404, 429),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/comments/{id}',
  tags: ['Comments'],
  summary: 'Delete a comment and its replies (author or moderator)',
  description: 'Also served as DELETE /api/comments/{id} (exam contract).',
  ...tenant,
  request: { headers: OrganizationHeader, params: IdParams },
  responses: {
    200: { description: 'Deleted', content: jsonContent(successResponse(Deleted)) },
    ...errorResponses(400, 401, 403, 404),
  },
});
