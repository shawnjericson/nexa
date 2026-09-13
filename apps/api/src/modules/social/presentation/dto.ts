import { toAttachmentsResponse, type FileView } from '../../file';
import { toUserReference, type UserSummary } from '../../identity';
import type { CursorPage } from '../application/pagination';
import type { Comment, Post, ReactionSummary } from '../domain/content';
import { canDeleteComment, canDeletePost, canEditPost, type Actor } from '../domain/policies';

export { toPagePagination } from '../../../shared/http/pagination';

type Authors = ReadonlyMap<string, UserSummary>;
type Files = ReadonlyMap<string, FileView>;

export function toReactionsResponse(summary: ReactionSummary) {
  return {
    total: summary.total,
    counts: summary.counts,
    viewer_reaction: summary.viewerReaction,
  };
}

export function toPostResponse(
  post: Post,
  authors: Authors,
  reactions: ReactionSummary,
  actor: Actor,
  files: Files,
) {
  return {
    id: post.id,
    organization_id: post.organizationId,
    author: toUserReference(authors.get(post.authorId)),
    content: post.content,
    image_url: post.imageUrl,
    attachments: toAttachmentsResponse(post.attachmentIds, files),
    type: post.type,
    visibility: post.visibility,
    comment_count: post.commentCount,
    reactions: toReactionsResponse(reactions),
    can_edit: canEditPost(actor, post),
    can_delete: canDeletePost(actor, post),
    created_at: post.createdAt.toISOString(),
    updated_at: post.updatedAt.toISOString(),
  };
}

export function toCommentResponse(comment: Comment, authors: Authors, actor: Actor) {
  return {
    id: comment.id,
    post_id: comment.postId,
    parent_id: comment.parentId,
    author: toUserReference(authors.get(comment.authorId)),
    content: comment.content,
    can_delete: canDeleteComment(actor, comment),
    created_at: comment.createdAt.toISOString(),
    updated_at: comment.updatedAt.toISOString(),
  };
}

export function toCursorPagination(page: CursorPage<unknown>, limit: number) {
  return { next_cursor: page.nextCursor, has_next: page.hasNext, limit };
}
