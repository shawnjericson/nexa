import {
  Bell,
  CornerDownRight,
  Megaphone,
  MessageCircle,
  MessageSquare,
  ShieldCheck,
  SmilePlus,
  type LucideIcon,
} from 'lucide-react';
import { INTL_LOCALES } from '@/i18n/config';
import type { Translator } from '@/i18n/translate';
import type { AppNotification } from '@/lib/chat-types';
import type { UserRef } from '@/lib/types';

export interface NotificationView {
  text: string;
  /** A short quote of what was written, when there is one. */
  excerpt: string | null;
  /** Where opening it goes; null when there is nothing to open. */
  href: string | null;
  icon: LucideIcon;
  /** Shown beside it; null for system notifications. */
  actor: UserRef | null;
}

const stringOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/**
 * Turns a notification into a sentence in the reader's language. Coalesced notifications
 * ("Bob and 3 others reacted") use their own wording rather than a plural of the single form.
 */
export function describeNotification(
  notification: AppNotification,
  i18n: Translator,
  conversationName: (id: string) => string | undefined,
): NotificationView {
  const { t, tn, tryT } = i18n;
  const meta = notification.metadata;
  const actors = notification.actors.filter((actor): actor is UserRef => Boolean(actor));
  const actor = actors[0] ?? notification.actor ?? null;
  const names =
    actors.length > 0
      ? actors.map((item) => item.display_name)
      : [actor?.display_name ?? t('notifications.someone')];
  const everyone = new Intl.ListFormat(INTL_LOCALES[i18n.locale], { type: 'conjunction' }).format(
    names,
  );
  const first = names[0] ?? everyone;
  const count = notification.count;
  const excerpt = stringOf(meta.excerpt);
  const postId = stringOf(meta.post_id);

  switch (notification.type) {
    case 'post.commented':
      return {
        text:
          count > 1
            ? tn('notifications.postCommentedMany', count, { actors: everyone })
            : t('notifications.postCommented', { actors: everyone }),
        excerpt,
        href: `/feed/${postId ?? notification.entity_id}`,
        icon: MessageCircle,
        actor,
      };
    case 'comment.replied':
      return {
        text:
          count > 1
            ? tn('notifications.commentRepliedMany', count, { actors: everyone })
            : t('notifications.commentReplied', { actors: everyone }),
        excerpt,
        href: postId ? `/feed/${postId}` : null,
        icon: CornerDownRight,
        actor,
      };
    case 'post.reacted': {
      // Reactions are one per person, so the count is close to the number of people.
      const others = Math.max(count, names.length) - 1;
      return {
        text:
          others > 0
            ? tn('notifications.postReactedMany', others, { actors: first })
            : t('notifications.postReacted', { actors: first }),
        excerpt: null,
        href: `/feed/${postId ?? notification.entity_id}`,
        icon: SmilePlus,
        actor,
      };
    }
    case 'announcement.published':
      return {
        text: t('notifications.announcement', { actors: first }),
        excerpt,
        href: `/feed/${postId ?? notification.entity_id}`,
        icon: Megaphone,
        actor,
      };
    case 'message.received': {
      const conversationId = stringOf(meta.conversation_id) ?? notification.entity_id;
      const direct = meta.conversation_type === 'DIRECT';
      const conversation = conversationName(conversationId) ?? t('notifications.aConversation');
      let text: string;
      if (direct) {
        text =
          count > 1
            ? tn('notifications.messageReceivedMany', count, { actors: first })
            : t('notifications.messageReceived', { actors: first });
      } else {
        text =
          count > 1
            ? tn('notifications.messageInConversationMany', count, { conversation })
            : t('notifications.messageInConversation', { actors: first, conversation });
      }
      return {
        text,
        excerpt,
        href: `/messages/${conversationId}`,
        icon: MessageSquare,
        actor,
      };
    }
    case 'member.role_changed': {
      const role = stringOf(meta.role);
      return {
        text: t('notifications.roleChanged', {
          role: (role && tryT(`organization.roles.${role}`)) ?? role ?? '',
        }),
        excerpt: null,
        href: null,
        icon: ShieldCheck,
        actor: null,
      };
    }
    default:
      return { text: t('notifications.generic'), excerpt: null, href: null, icon: Bell, actor };
  }
}
