import type { EventBus } from '../../../shared/events/event-bus';
import { MESSAGE_CREATED, type MessageCreatedEvent } from '../../communication';
import {
  MEMBER_UPDATED,
  type MemberUpdatedEvent,
  type OrganizationDirectory,
} from '../../organization';
import {
  COMMENT_CREATED,
  POST_CREATED,
  POST_REACTED,
  type CommentCreatedEvent,
  type PostCreatedEvent,
  type PostReactedEvent,
} from '../../social';
import type { NotificationDraft } from '../domain/notification';
import type { NotificationService } from './notification.service';

/**
 * Who hears about what (spec 11.1). Producers publish domain events and know nothing about
 * notifications; this is the only place that maps events to recipients.
 */
export function registerNotificationRules(
  events: EventBus,
  notifications: NotificationService,
  directory: OrganizationDirectory,
): void {
  events.subscribe<CommentCreatedEvent>(COMMENT_CREATED, async (event) => {
    const { post_id, post_author_id, parent_id, parent_author_id, excerpt } = event.metadata;
    const drafts: NotificationDraft[] = [
      {
        recipientId: post_author_id,
        actorId: event.actor_id,
        type: 'post.commented',
        entityType: 'post',
        entityId: post_id,
        groupKey: `post.commented:${post_id}`,
        metadata: { post_id, comment_id: event.subject_id, excerpt },
      },
    ];
    // The person replied to hears about it too, unless they already do as the post's author.
    if (parent_id && parent_author_id && parent_author_id !== post_author_id) {
      drafts.push({
        recipientId: parent_author_id,
        actorId: event.actor_id,
        type: 'comment.replied',
        entityType: 'comment',
        entityId: parent_id,
        groupKey: `comment.replied:${parent_id}`,
        metadata: { post_id, parent_id, comment_id: event.subject_id, excerpt },
      });
    }
    await notifications.deliver(event, drafts);
  });

  events.subscribe<PostReactedEvent>(POST_REACTED, async (event) => {
    const { post_id, post_author_id, reaction, previous_reaction } = event.metadata;
    // Switching from LIKE to LOVE is not a new reaction; counting it would inflate the group.
    if (previous_reaction) return;
    await notifications.deliver(event, [
      {
        recipientId: post_author_id,
        actorId: event.actor_id,
        type: 'post.reacted',
        entityType: 'post',
        entityId: post_id,
        groupKey: `post.reacted:${post_id}`,
        metadata: { post_id, reaction },
      },
    ]);
  });

  events.subscribe<PostCreatedEvent>(POST_CREATED, async (event) => {
    if (
      event.metadata.post_type !== 'ANNOUNCEMENT' ||
      !event.organization_id ||
      !event.subject_id
    ) {
      return;
    }
    const postId = event.subject_id;
    const recipients = await directory.listActiveMemberIds(event.organization_id);
    await notifications.deliver(
      event,
      recipients.map((recipientId) => ({
        recipientId,
        actorId: event.actor_id,
        type: 'announcement.published',
        entityType: 'post',
        entityId: postId,
        groupKey: null,
        metadata: { post_id: postId, excerpt: event.metadata.excerpt },
      })),
    );
  });

  events.subscribe<MessageCreatedEvent>(MESSAGE_CREATED, async (event) => {
    const { conversation_id, conversation_type, seq, recipient_ids, excerpt, attachment_count } =
      event.metadata;
    await notifications.deliver(
      event,
      recipient_ids.map((recipientId) => ({
        recipientId,
        actorId: event.actor_id,
        type: 'message.received',
        entityType: 'conversation',
        entityId: conversation_id,
        // One notification per conversation, counting unread messages.
        groupKey: `message.received:${conversation_id}`,
        metadata: {
          conversation_id,
          conversation_type,
          message_id: event.subject_id,
          seq,
          excerpt,
          attachment_count,
        },
      })),
    );
  });

  events.subscribe<MemberUpdatedEvent>(MEMBER_UPDATED, async (event) => {
    const { previous_role, role } = event.metadata;
    if (!event.subject_id || !event.organization_id || previous_role === role) return;
    await notifications.deliver(event, [
      {
        recipientId: event.subject_id,
        actorId: event.actor_id,
        type: 'member.role_changed',
        entityType: 'organization',
        entityId: event.organization_id,
        groupKey: null,
        metadata: { role, previous_role },
      },
    ]);
  });
}
