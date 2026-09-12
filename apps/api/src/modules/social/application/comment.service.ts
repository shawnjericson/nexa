import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import type { Comment, Post } from '../domain/content';
import { COMMENT_CREATED, type CommentCreatedEvent } from '../domain/events';
import { canDeleteComment, type Actor } from '../domain/policies';
import type { CommentRepository, PostRepository } from '../domain/ports';
import { SocialErrors } from '../domain/social-errors';
import { decodeCursor, toCursorPage, type CursorPage, type OffsetPage } from './pagination';

export class CommentService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      posts: PostRepository;
      comments: CommentRepository;
      events: EventBus;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Oldest first, cursor-paginated. */
  async list(
    actor: Actor,
    postId: string,
    options: { limit: number; cursor?: string },
  ): Promise<CursorPage<Comment>> {
    await this.requirePost(actor, postId);
    const after = options.cursor ? decodeCursor(options.cursor) : undefined;
    const rows = await this.deps.comments.listForPost(actor.organization.organizationId, postId, {
      take: options.limit + 1,
      after,
    });
    return toCursorPage(rows, options.limit);
  }

  /** Page/limit pagination for the exam contract (GET /api/comments/post/:postId). */
  async listPage(
    actor: Actor,
    postId: string,
    options: { page: number; limit: number },
  ): Promise<OffsetPage<Comment>> {
    await this.requirePost(actor, postId);
    const { items, total } = await this.deps.comments.listForPostPage(
      actor.organization.organizationId,
      postId,
      { skip: (options.page - 1) * options.limit, take: options.limit },
    );
    return { items, total, page: options.page, limit: options.limit };
  }

  async create(
    actor: Actor,
    postId: string,
    input: { content: string; parentId?: string },
  ): Promise<Comment> {
    const post = await this.requirePost(actor, postId);

    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.deps.comments.findById(
        actor.organization.organizationId,
        input.parentId,
      );
      if (!parent || parent.postId !== post.id) throw SocialErrors.parentCommentNotFound();
      // Nesting is bounded to one level: a reply to a reply joins its thread root (risk register 7.4).
      parentId = parent.parentId ?? parent.id;
    }

    const comment = await this.deps.comments.create({
      organizationId: actor.organization.organizationId,
      postId: post.id,
      authorId: actor.userId,
      parentId,
      content: input.content,
    });

    const event: CommentCreatedEvent = createEvent(COMMENT_CREATED, {
      organization_id: comment.organizationId,
      actor_id: actor.userId,
      subject_id: comment.id,
      metadata: { post_id: post.id, post_author_id: post.authorId, parent_id: parentId },
    });
    await this.deps.events.publish(event);
    return comment;
  }

  /** Deleting a comment also removes its replies, so threads never dangle. */
  async delete(actor: Actor, id: string): Promise<void> {
    const comment = await this.deps.comments.findById(actor.organization.organizationId, id);
    if (!comment) throw SocialErrors.commentNotFound();
    if (!canDeleteComment(actor, comment)) throw SocialErrors.commentDeleteForbidden();

    const deleted = await this.deps.comments.softDeleteThread(
      actor.organization.organizationId,
      id,
      this.now(),
    );
    if (!deleted) throw SocialErrors.commentNotFound();
  }

  private async requirePost(actor: Actor, postId: string): Promise<Post> {
    const post = await this.deps.posts.findById(actor.organization.organizationId, postId);
    if (!post) throw SocialErrors.postNotFound();
    return post;
  }
}
