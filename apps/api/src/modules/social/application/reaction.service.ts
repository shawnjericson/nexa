import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { emptyReactionSummary, type ReactionSummary, type ReactionType } from '../domain/content';
import { POST_REACTED, type PostReactedEvent } from '../domain/events';
import type { Actor } from '../domain/policies';
import type { PostRepository, ReactionRepository } from '../domain/ports';
import { SocialErrors } from '../domain/social-errors';

export class ReactionService {
  constructor(
    private readonly deps: {
      posts: PostRepository;
      reactions: ReactionRepository;
      events: EventBus;
    },
  ) {}

  /** Idempotent: reacting again with the same type changes nothing, another type replaces it. */
  async react(actor: Actor, postId: string, type: ReactionType): Promise<ReactionSummary> {
    const organizationId = actor.organization.organizationId;
    const post = await this.deps.posts.findById(organizationId, postId);
    if (!post) throw SocialErrors.postNotFound();

    const { previous } = await this.deps.reactions.set(organizationId, post.id, actor.userId, type);
    if (previous !== type) {
      const event: PostReactedEvent = createEvent(POST_REACTED, {
        organization_id: organizationId,
        actor_id: actor.userId,
        subject_id: post.id,
        metadata: {
          post_id: post.id,
          post_author_id: post.authorId,
          reaction: type,
          previous_reaction: previous,
        },
      });
      await this.deps.events.publish(event);
    }
    return this.summaryOf(actor, post.id);
  }

  /** Idempotent: removing a reaction that doesn't exist succeeds. */
  async unreact(actor: Actor, postId: string): Promise<ReactionSummary> {
    const organizationId = actor.organization.organizationId;
    const post = await this.deps.posts.findById(organizationId, postId);
    if (!post) throw SocialErrors.postNotFound();

    await this.deps.reactions.remove(organizationId, post.id, actor.userId);
    return this.summaryOf(actor, post.id);
  }

  summarize(actor: Actor, postIds: readonly string[]): Promise<Map<string, ReactionSummary>> {
    return this.deps.reactions.summarize(actor.organization.organizationId, postIds, actor.userId);
  }

  private async summaryOf(actor: Actor, postId: string): Promise<ReactionSummary> {
    return (await this.summarize(actor, [postId])).get(postId) ?? emptyReactionSummary();
  }
}
