'use client';

import { Hash, Users } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { conversationTitle } from '@/features/chat/conversation-display';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import type { UserRef } from '@/lib/types';
import type { ConversationHit, MessageHit, PostHit } from './queries';
import { snippetParts } from './snippet';

const ROW =
  'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-subtle';

/** Search snippet with the matched words marked. */
export function Snippet({
  snippet,
  className,
}: {
  snippet: { text: string; highlights: number[][] };
  className?: string;
}) {
  return (
    <span className={className}>
      {snippetParts(snippet.text, snippet.highlights).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-accent-soft px-px text-fg">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export function PersonHit({ user }: { user: UserRef }) {
  return (
    <li>
      <Link href={`/people/${user.id}`} className={cn(ROW, 'items-center')}>
        <Avatar name={user.display_name} src={user.avatar_url} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg">{user.display_name}</span>
          <span className="block truncate text-xs text-muted">@{user.username}</span>
        </span>
      </Link>
    </li>
  );
}

export function PostHitRow({ hit }: { hit: PostHit }) {
  const { t, formatRelative } = useI18n();
  const author = hit.author?.display_name ?? t('common.formerMember');
  return (
    <li>
      <Link href={`/feed/${hit.id}`} className={ROW}>
        <Avatar name={author} src={hit.author?.avatar_url} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="truncate font-medium text-fg">{author}</span>
            <time dateTime={hit.created_at} className="shrink-0">
              {formatRelative(hit.created_at)}
            </time>
            {hit.type === 'ANNOUNCEMENT' && <Badge tone="accent">{t('feed.announcement')}</Badge>}
          </span>
          <Snippet snippet={hit.snippet} className="mt-0.5 line-clamp-2 block text-sm text-fg" />
        </span>
      </Link>
    </li>
  );
}

export function ConversationHitRow({ hit }: { hit: ConversationHit }) {
  const { t, tn } = useI18n();
  const Icon = hit.type === 'CHANNEL' ? Hash : Users;
  const name = hit.name ?? hit.slug ?? '';
  // A channel you haven't joined opens in the channel browser, where you can join it.
  const href = hit.joined ? `/messages/${hit.id}` : `/channels?open=${hit.id}`;
  return (
    <li>
      <Link href={href} className={cn(ROW, 'items-center')}>
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-muted"
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{name}</span>
            {hit.joined && <Badge tone="accent">{t('search.joined')}</Badge>}
            {hit.archived && <Badge>{t('channels.archived')}</Badge>}
          </span>
          <span className="block truncate text-xs text-muted">
            {[tn('chat.members', hit.member_count), hit.description].filter(Boolean).join(' · ')}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function MessageHitRow({ hit }: { hit: MessageHit }) {
  const { t, formatRelative } = useI18n();
  const sender = hit.sender?.display_name ?? t('common.formerMember');
  const title = conversationTitle(hit.conversation, t('common.formerMember'));
  const where = hit.conversation.type === 'CHANNEL' ? `#${title}` : title;
  return (
    <li>
      <Link href={`/messages/${hit.conversation.id}`} className={ROW}>
        <Avatar name={sender} src={hit.sender?.avatar_url} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0 font-medium text-fg">{sender}</span>
            <span className="truncate">{t('search.inConversation', { name: where })}</span>
            <time dateTime={hit.created_at} className="shrink-0">
              · {formatRelative(hit.created_at)}
            </time>
          </span>
          <Snippet snippet={hit.snippet} className="mt-0.5 line-clamp-2 block text-sm text-fg" />
        </span>
      </Link>
    </li>
  );
}
