import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { excerpt } from '../../../shared/utils/excerpt';
import type { FileDirectory } from '../../file';
import type { Post, PostType } from '../domain/content';
import {
  POST_CREATED,
  POST_DELETED,
  type PostCreatedEvent,
  type PostDeletedEvent,
} from '../domain/events';
import { canDeletePost, canEditPost, canPublish, type Actor } from '../domain/policies';
import type { PostChanges, PostRepository } from '../domain/ports';
import { SocialErrors } from '../domain/social-errors';
import { decodeCursor, toCursorPage, type CursorPage, type OffsetPage } from './pagination';

export class PostService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      posts: PostRepository;
      files: FileDirectory;
      events: EventBus;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async create(
    actor: Actor,
    input: { content: string; imageUrl: string | null; type: PostType; attachmentIds: string[] },
  ): Promise<Post> {
    if (!canPublish(actor, input.type)) throw SocialErrors.announcementForbidden();
    await this.requireAttachable(actor, input.attachmentIds);

    const post = await this.deps.posts.create({
      // The organization always comes from the resolved membership, never from the client.
      organizationId: actor.organization.organizationId,
      authorId: actor.userId,
      content: input.content,
      imageUrl: input.imageUrl,
      type: input.type,
      visibility: 'ORGANIZATION',
      attachmentIds: input.attachmentIds,
    });

    const event: PostCreatedEvent = createEvent(POST_CREATED, {
      organization_id: post.organizationId,
      actor_id: actor.userId,
      subject_id: post.id,
      metadata: { post_type: post.type, excerpt: excerpt(post.content) },
    });
    await this.deps.events.publish(event);
    return post;
  }

  async get(actor: Actor, id: string): Promise<Post> {
    const post = await this.deps.posts.findById(actor.organization.organizationId, id);
    if (!post) throw SocialErrors.postNotFound();
    return post;
  }

  async update(actor: Actor, id: string, changes: PostChanges): Promise<Post> {
    const post = await this.get(actor, id);
    if (!canEditPost(actor, post)) throw SocialErrors.postEditForbidden();
    // Only the author edits, and every attachment of the post is one of their own uploads.
    if (changes.attachmentIds) await this.requireAttachable(actor, changes.attachmentIds);

    // If the post was deleted between the check and the write, deletion wins (risk register 7.1).
    const updated = await this.deps.posts.update(actor.organization.organizationId, id, changes);
    if (!updated) throw SocialErrors.postNotFound();
    return updated;
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const post = await this.get(actor, id);
    if (!canDeletePost(actor, post)) throw SocialErrors.postDeleteForbidden();

    const deleted = await this.deps.posts.softDelete(
      actor.organization.organizationId,
      id,
      this.now(),
    );
    if (!deleted) throw SocialErrors.postNotFound();

    const event: PostDeletedEvent = createEvent(POST_DELETED, {
      organization_id: post.organizationId,
      actor_id: actor.userId,
      subject_id: post.id,
      metadata: { author_id: post.authorId, moderated: post.authorId !== actor.userId },
    });
    await this.deps.events.publish(event);
  }

  /** Cursor pagination on (created_at, id): new posts never shift later pages (risk register 8.1). */
  async feed(actor: Actor, options: { limit: number; cursor?: string }): Promise<CursorPage<Post>> {
    const after = options.cursor ? decodeCursor(options.cursor) : undefined;
    const rows = await this.deps.posts.listFeed(actor.organization.organizationId, {
      take: options.limit + 1,
      after,
    });
    return toCursorPage(rows, options.limit);
  }

  /** Page/limit pagination for the exam contract (GET /api/posts). */
  async feedPage(
    actor: Actor,
    options: { page: number; limit: number },
  ): Promise<OffsetPage<Post>> {
    const { items, total } = await this.deps.posts.listFeedPage(actor.organization.organizationId, {
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });
    return { items, total, page: options.page, limit: options.limit };
  }

  private async requireAttachable(actor: Actor, attachmentIds: readonly string[]): Promise<void> {
    await this.deps.files.requireAttachable(
      { organizationId: actor.organization.organizationId, userId: actor.userId },
      attachmentIds,
    );
  }
}
