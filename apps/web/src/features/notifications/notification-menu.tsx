'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
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

const OPEN_EVENT = 'nexa:notifications';

/** Opens the notifications panel from elsewhere (the home briefing). */
export function openNotifications(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

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

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-subtle',
          unread && 'bg-accent-soft/40',
        )}
      >
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
          <span className={cn('block text-[13px]', unread ? 'font-medium text-fg' : 'text-muted')}>
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
      </button>
    </li>
  );
}

/** What is inside the panel; only loaded while it is open. */
function NotificationList({ onNavigate }: { onNavigate(href: string): void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const list = useNotifications(filter);
  const markRead = useMarkNotificationRead();
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

  function open(notification: AppNotification, view: NotificationView) {
    if (!notification.read) markRead.mutate(notification.id);
    if (view.href) onNavigate(view.href);
  }

  return (
    <>
      <div role="tablist" className="flex gap-1 px-3 pb-2">
        {(['all', 'unread'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              filter === item
                ? 'bg-surface-subtle text-fg'
                : 'text-muted hover:bg-surface-subtle hover:text-fg',
            )}
          >
            {item === 'all' ? t('notifications.all') : t('notifications.unread')}
          </button>
        ))}
      </div>

      <div className="max-h-[min(28rem,60vh)] overflow-y-auto">
        {list.isPending ? (
          <div className="flex flex-col gap-4 p-3" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            className="py-10"
            icon={filter === 'unread' ? CheckCheck : Bell}
            title={filter === 'unread' ? t('notifications.emptyUnread') : t('notifications.empty')}
            description={filter === 'unread' ? undefined : t('notifications.emptyDescription')}
          />
        ) : (
          GROUPS.map((group) => {
            const rows = items.filter((item) => groupOf(item.updated_at, now) === group.id);
            if (rows.length === 0) return null;
            return (
              <section key={group.id} aria-label={t(group.label)}>
                <h3 className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-wider text-muted uppercase">
                  {t(group.label)}
                </h3>
                <ul>
                  {rows.map((notification) => {
                    const view = describeNotification(notification, i18n, (id) => names.get(id));
                    return (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        view={view}
                        onOpen={() => open(notification, view)}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}

        {list.hasNextPage && (
          <div className="flex justify-center py-2">
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
    </>
  );
}

/**
 * Activity lives in the top bar rather than on a page of its own (a page just repeated the same
 * list one click further away). The panel loads only while it is open.
 */
export function NotificationBell() {
  const i18n = useI18n();
  const { t, tn } = i18n;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  const markAll = useMarkAllNotificationsRead();
  const unreadCount = unread.data?.unread_count ?? 0;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const label =
    unreadCount > 0
      ? `${t('nav.notifications')} - ${tn('shell.unreadCount', unreadCount)}`
      : t('nav.notifications');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-subtle hover:text-fg data-[state=open]:bg-surface-subtle data-[state=open]:text-fg"
      >
        <Bell className="size-[18px]" aria-hidden />
        {/* How many, not just that there are some: a dot sends you looking for what changed. */}
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-accent-contrast ring-2 ring-background"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
          <h2 className="text-sm font-semibold">{t('notifications.title')}</h2>
          <Button
            variant="ghost"
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
        </div>
        {open && (
          <NotificationList
            onNavigate={(href) => {
              setOpen(false);
              router.push(href);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
