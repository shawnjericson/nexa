'use client';

import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/states';
import { conversationTitle } from '@/features/chat/conversation-display';
import { useConversations } from '@/features/chat/queries';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/translate';
import { describeError } from '@/lib/api/errors';
import type { AppNotification } from '@/lib/chat-types';
import { cn } from '@/lib/cn';
import { describeNotification, type NotificationView } from './describe';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type NotificationFilter,
} from './queries';

const GROUPS: Array<{ id: 'today' | 'yesterday' | 'earlier'; label: MessageKey }> = [
  { id: 'today', label: 'notifications.today' },
  { id: 'yesterday', label: 'notifications.yesterday' },
  { id: 'earlier', label: 'notifications.earlier' },
];

function groupOf(iso: string, now: Date): 'today' | 'yesterday' | 'earlier' {
  const day = new Date(iso).toDateString();
  if (day === now.toDateString()) return 'today';
  if (day === new Date(now.getTime() - 86_400_000).toDateString()) return 'yesterday';
  return 'earlier';
}

function NotificationRow({
  notification,
  view,
  onOpen,
}: {
  notification: AppNotification;
  view: NotificationView;
  onOpen(): void;
}) {
  const { t, formatRelative, formatDate } = useI18n();
  const Icon = view.icon;
  const unread = !notification.read;
  const className = cn(
    'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-subtle',
    unread && 'bg-accent-soft/40',
  );
  const content = (
    <>
      <span className="relative shrink-0">
        {view.actor ? (
          <>
            <Avatar name={view.actor.display_name} src={view.actor.avatar_url} size="md" />
            <span
              aria-hidden
              className="absolute -right-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full border-2 border-surface bg-surface-subtle text-muted"
            >
              <Icon className="size-3" />
            </span>
          </>
        ) : (
          <span
            aria-hidden
            className="inline-flex size-9 items-center justify-center rounded-full bg-surface-subtle text-muted"
          >
            <Icon className="size-4" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', unread ? 'font-medium text-fg' : 'text-muted')}>
          {view.text}
        </span>
        {view.excerpt && (
          <span className="mt-0.5 block truncate text-xs text-muted">“{view.excerpt}”</span>
        )}
        <time
          dateTime={notification.updated_at}
          title={formatDate(notification.updated_at, { dateStyle: 'long', timeStyle: 'short' })}
          className="mt-0.5 block text-[11px] text-muted"
        >
          {formatRelative(notification.updated_at)}
        </time>
      </span>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent">
          <span className="sr-only">{t('notifications.unreadDot')}</span>
        </span>
      )}
    </>
  );
  return (
    <li>
      {view.href ? (
        <Link href={view.href} onClick={onOpen} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className={className}>
          {content}
        </button>
      )}
    </li>
  );
}

/** Activity about you: grouped by day, unread first in tone, opened in one click (spec §6). */
export function NotificationCenter() {
  const i18n = useI18n();
  const { t } = i18n;
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const list = useNotifications(filter);
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const conversations = useConversations();

  // Message notifications name the group or channel they came from, when it is known.
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of conversations.data?.pages.flatMap((page) => page.data) ?? []) {
      const title = conversationTitle(item, t('common.formerMember'));
      map.set(item.id, item.type === 'CHANNEL' ? `#${title}` : title);
    }
    return map;
  }, [conversations.data, t]);

  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  const now = new Date();
  const unreadCount = unread.data?.unread_count ?? 0;

  function open(notification: AppNotification) {
    if (!notification.read) markRead.mutate(notification.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title={t('notifications.title')}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={unreadCount === 0}
            loading={markAll.isPending}
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: () => toast.success(t('notifications.allRead')),
                onError: (error) => toast.error(describeError(error, i18n)),
              })
            }
          >
            <CheckCheck aria-hidden />
            {t('notifications.markAllRead')}
          </Button>
        }
      />

      <div role="tablist" className="inline-flex self-start rounded-lg bg-surface-subtle p-0.5">
        {(['all', 'unread'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
            className={cn(
              'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
              filter === item ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {item === 'all' ? t('notifications.all') : t('notifications.unread')}
            {item === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 text-xs text-muted">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {list.isPending ? (
          <div className="flex flex-col gap-4 px-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          filter === 'unread' ? (
            <EmptyState icon={CheckCheck} title={t('notifications.emptyUnread')} />
          ) : (
            <EmptyState
              icon={Bell}
              title={t('notifications.empty')}
              description={t('notifications.emptyDescription')}
            />
          )
        ) : (
          <div className="flex flex-col gap-6">
            {GROUPS.map((group) => {
              const rows = items.filter((item) => groupOf(item.updated_at, now) === group.id);
              if (rows.length === 0) return null;
              return (
                <section key={group.id} aria-label={t(group.label)}>
                  <h2 className="mb-1 px-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                    {t(group.label)}
                  </h2>
                  <ul className="-mx-0 flex flex-col">
                    {rows.map((notification) => (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        view={describeNotification(notification, i18n, (id) => names.get(id))}
                        onOpen={() => open(notification)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {list.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={list.isFetchingNextPage}
                  onClick={() => list.fetchNextPage()}
                >
                  {t('notifications.loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
