'use client';

import { MessageSquare, Search, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import type { ConversationSummary, ConversationType } from '@/lib/chat-types';
import { cn } from '@/lib/cn';
import { fold } from '@/lib/format';
import { ConversationIcon, conversationTitle } from './conversation-display';
import { NewConversationDialog } from './new-conversation-dialog';
import { useConversations } from './queries';

const SECTIONS: Array<{
  type: ConversationType;
  label: 'chat.direct' | 'chat.groups' | 'chat.channels';
}> = [
  { type: 'DIRECT', label: 'chat.direct' },
  { type: 'GROUP', label: 'chat.groups' },
  { type: 'CHANNEL', label: 'chat.channels' },
];

function isToday(date: Date) {
  return date.toDateString() === new Date().toDateString();
}

function Row({
  item,
  active,
  meId,
}: {
  item: ConversationSummary;
  active: boolean;
  meId?: string;
}) {
  const { t, formatTime, formatDate } = useI18n();
  const title = conversationTitle(item, t('common.formerMember'));
  const message = item.last_message;
  const unread = item.unread_count > 0;

  let preview = item.description ?? '';
  if (message) {
    const text = message.deleted
      ? t('chat.deletedMessage')
      : message.content || (message.attachments.length > 0 ? `📎 ${t('chat.attachment')}` : '');
    const sender =
      message.sender?.id === meId
        ? t('chat.you')
        : item.type === 'DIRECT'
          ? null
          : (message.sender?.display_name ?? t('common.formerMember'));
    preview = sender ? `${sender}: ${text}` : text;
  }
  const at = item.last_message_at ? new Date(item.last_message_at) : null;

  return (
    <li>
      <Link
        href={`/messages/${item.id}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
          active ? 'bg-surface-subtle' : 'hover:bg-surface-subtle',
        )}
      >
        <ConversationIcon conversation={item} title={title} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                unread ? 'font-semibold text-fg' : 'font-medium text-fg',
              )}
            >
              {item.type === 'CHANNEL' ? `# ${title}` : title}
            </span>
            {at && (
              <time
                dateTime={item.last_message_at ?? undefined}
                className="shrink-0 text-[11px] text-muted"
              >
                {isToday(at)
                  ? formatTime(at)
                  : formatDate(at, { day: 'numeric', month: 'numeric' })}
              </time>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span
              className={cn('min-w-0 flex-1 truncate text-xs', unread ? 'text-fg' : 'text-muted')}
            >
              {preview}
            </span>
            {unread && (
              <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-contrast">
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Conversations grouped as Direct / Groups / Channels, most recent first (spec §6). */
export function ConversationList() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const params = useParams<{ conversationId?: string }>();
  const searchParams = useSearchParams();
  const conversations = useConversations();
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(searchParams.get('new') === '1');

  const items = useMemo(
    () => conversations.data?.pages.flatMap((page) => page.data) ?? [],
    [conversations.data],
  );
  const needle = fold(query.trim());
  const visible = needle
    ? items.filter((item) => fold(conversationTitle(item, '')).includes(needle))
    : items;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="flex-1 text-base font-semibold">{t('chat.title')}</h1>
        <IconButton
          label={t('chat.newConversation')}
          icon={SquarePen}
          size="icon-sm"
          onClick={() => setDialogOpen(true)}
        />
      </div>
      <div className="relative px-4 pb-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('chat.searchPlaceholder')}
          aria-label={t('chat.searchPlaceholder')}
          className="h-8 pl-9"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {conversations.isPending ? (
          <div className="flex flex-col gap-3 px-2 pt-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.isError ? (
          <ErrorState error={conversations.error} onRetry={() => conversations.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t('chat.emptyList')}
            description={t('chat.emptyListDescription')}
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                {t('chat.newConversation')}
              </Button>
            }
          />
        ) : (
          SECTIONS.map((section) => {
            const rows = visible.filter((item) => item.type === section.type);
            if (rows.length === 0) return null;
            return (
              <section key={section.type} aria-label={t(section.label)} className="mt-3">
                <h2 className="mb-1 px-2 text-[11px] font-medium tracking-wider text-muted uppercase">
                  {t(section.label)}
                </h2>
                <ul>
                  {rows.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      active={item.id === params.conversationId}
                      meId={me?.id}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
        {conversations.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              loading={conversations.isFetchingNextPage}
              onClick={() => conversations.fetchNextPage()}
            >
              {t('feed.loadMore')}
            </Button>
          </div>
        )}
      </div>

      <NewConversationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
