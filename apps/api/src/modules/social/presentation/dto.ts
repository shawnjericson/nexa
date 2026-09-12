import type { UserSummary } from '../../identity';
import type { CursorPage, OffsetPage } from '../application/pagination';
import type { Comment, Post } from '../domain/content';
import { canDeleteComment, canDeletePost, canEditPost, type Actor } from '../domain/policies';

type Authors = ReadonlyMap<string, UserSummary>;

/** Content keeps its author after deactivation; clients show them as a former member (7.5, 12.4). */
export function toAuthorResponse(author: UserSummary | undefined) {
  if (!author) return null;
  return {
    id: author.id,
    username: author.username,
    display_name: author.displayName,
    avatar_url: author.avatarUrl,
    deactivated: author.status !== 'ACTIVE',
  };
}

export function toPostResponse(post: Post, authors: Authors, actor: Actor) {
  return {
    id: post.id,
    organization_id: post.organizationId,
    author: toAuthorResponse(authors.get(post.authorId)),
    content: post.content,
    image_url: post.imageUrl,
    type: post.type,
    visibility: post.visibility,
    comment_count: post.commentCount,
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
    author: toAuthorResponse(authors.get(comment.authorId)),
    content: comment.content,
    can_delete: canDeleteComment(actor, comment),
    created_at: comment.createdAt.toISOString(),
    updated_at: comment.updatedAt.toISOString(),
  };
}

export function toCursorPagination(page: CursorPage<unknown>, limit: number) {
  return { next_cursor: page.nextCursor, has_next: page.hasNext, limit };
}

export function toPagePagination(page: OffsetPage<unknown>) {
  const totalPages = Math.ceil(page.total / page.limit);
  return {
    page: page.page,
    limit: page.limit,
    total: page.total,
    total_pages: totalPages,
    has_next: page.page < totalPages,
  };
}
