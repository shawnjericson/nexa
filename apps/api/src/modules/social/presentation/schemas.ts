import { z } from 'zod';
import '../../../shared/http/openapi';
import { UserReference } from '../../identity';
import { REACTION_TYPES } from '../domain/content';

export { PagePagination, PageQuery, type PageQueryInput } from '../../../shared/http/pagination';

// Content is stored as plain text; clients must render it escaped (no HTML).
const Content = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Content must not be empty')
    .max(max, `Content must be at most ${max} characters`);

const ImageUrl = z
  .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
  .max(2048)
  .openapi({ example: 'https://cdn.nexa.io/posts/team-photo.png' });

// ─── Requests ──────────────────────────────────────────────────────────────

export const CreatePostBody = z
  .object({
    content: Content(10_000).openapi({ example: 'Chào mừng cả team đến với NEXA!' }),
    image_url: ImageUrl.nullable().optional(),
    type: z
      .enum(['GENERAL', 'ANNOUNCEMENT'])
      .default('GENERAL')
      .openapi({ description: 'ANNOUNCEMENT requires the announcement.publish permission' }),
  })
  .openapi('CreatePostRequest');

export const UpdatePostBody = z
  .object({
    content: Content(10_000).optional(),
    image_url: ImageUrl.nullable().optional(),
  })
  .refine((body) => body.content !== undefined || body.image_url !== undefined, {
    message: 'Provide content or image_url',
  })
  .openapi('UpdatePostRequest');

export const CreateCommentBody = z
  .object({
    content: Content(2_000).openapi({ example: 'Tuyệt vời!' }),
    parent_id: z.uuid().optional().openapi({
      description: 'Reply to this comment. A reply to a reply is attached to the thread root.',
    }),
  })
  .openapi('CreateCommentRequest');

export const ReactBody = z.object({ type: z.enum(REACTION_TYPES) }).openapi('ReactRequest');

export const IdParams = z.object({ id: z.uuid() });
export const ExamPostIdParams = z.object({ postId: z.uuid() });

export const CursorQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Responses ─────────────────────────────────────────────────────────────

export const Reactions = z
  .object({
    total: z.number().int(),
    counts: z.object({
      LIKE: z.number().int(),
      LOVE: z.number().int(),
      HAHA: z.number().int(),
      CELEBRATE: z.number().int(),
      SAD: z.number().int(),
    }),
    viewer_reaction: z.enum(REACTION_TYPES).nullable(),
  })
  .openapi('Reactions');

export const PostResponse = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    author: UserReference.nullable(),
    content: z.string(),
    image_url: z.string().nullable(),
    type: z.enum(['GENERAL', 'ANNOUNCEMENT', 'EVENT', 'POLL']),
    visibility: z.enum(['ORGANIZATION', 'DEPARTMENT', 'CHANNEL']),
    comment_count: z.number().int(),
    reactions: Reactions,
    can_edit: z.boolean().openapi({ description: 'Whether the caller may edit (UI hint)' }),
    can_delete: z.boolean().openapi({ description: 'Whether the caller may delete (UI hint)' }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('Post');

export const CommentResponse = z
  .object({
    id: z.uuid(),
    post_id: z.uuid(),
    parent_id: z.uuid().nullable(),
    author: UserReference.nullable(),
    content: z.string(),
    can_delete: z.boolean(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('Comment');

export const CursorPagination = z
  .object({
    next_cursor: z.string().nullable(),
    has_next: z.boolean(),
    limit: z.number().int(),
  })
  .openapi('CursorPagination');

export const Deleted = z.object({ id: z.uuid(), deleted: z.literal(true) }).openapi('Deleted');

export type CreatePostInput = z.infer<typeof CreatePostBody>;
export type UpdatePostInput = z.infer<typeof UpdatePostBody>;
export type CreateCommentInput = z.infer<typeof CreateCommentBody>;
export type ReactInput = z.infer<typeof ReactBody>;
export type CursorQueryInput = z.infer<typeof CursorQuery>;
