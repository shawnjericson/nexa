import type { Comment, Post, PostType, PostVisibility } from './content';

/** Keyset position: the (created_at, id) of the last row of the previous page. */
export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export interface NewPost {
  organizationId: string;
  authorId: string;
  content: string;
  imageUrl: string | null;
  type: PostType;
  visibility: PostVisibility;
}

export interface PostChanges {
  content?: string;
  imageUrl?: string | null;
}

/** Every method is scoped by organization and ignores soft-deleted posts. */
export interface PostRepository {
  create(post: NewPost): Promise<Post>;
  findById(organizationId: string, id: string): Promise<Post | null>;
  /** Returns null when the post no longer exists (e.g. it was deleted concurrently). */
  update(organizationId: string, id: string, changes: PostChanges): Promise<Post | null>;
  /** Returns false when the post was already gone. */
  softDelete(organizationId: string, id: string, at: Date): Promise<boolean>;
  /** Newest first, strictly after `after` in that order. */
  listFeed(
    organizationId: string,
    options: { take: number; after?: KeysetCursor },
  ): Promise<Post[]>;
  listFeedPage(
    organizationId: string,
    options: { skip: number; take: number },
  ): Promise<{ items: Post[]; total: number }>;
}

export interface NewComment {
  organizationId: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  content: string;
}

/** Scoped by organization; ignores deleted comments and comments of deleted posts. */
export interface CommentRepository {
  create(comment: NewComment): Promise<Comment>;
  findById(organizationId: string, id: string): Promise<Comment | null>;
  /** Oldest first, strictly after `after` in that order. */
  listForPost(
    organizationId: string,
    postId: string,
    options: { take: number; after?: KeysetCursor },
  ): Promise<Comment[]>;
  listForPostPage(
    organizationId: string,
    postId: string,
    options: { skip: number; take: number },
  ): Promise<{ items: Comment[]; total: number }>;
  /** Soft-deletes the comment together with its replies. Returns false when it was already gone. */
  softDeleteThread(organizationId: string, id: string, at: Date): Promise<boolean>;
}
