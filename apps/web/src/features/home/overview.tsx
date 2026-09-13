'use client';

import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  PenSquare,
  Plus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/states';
import { SuggestedChannels } from '@/features/channels/suggested-channels';
import { useFeed } from '@/features/feed/queries';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import type { Post } from '@/lib/types';

function greetingKey(hour: number) {
  if (hour < 12) return 'home.greetingMorning' as const;
  if (hour < 18) return 'home.greetingAfternoon' as const;
  return 'home.greetingEvening' as const;
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

function BriefingRow({
  href,
  icon: Icon,
  children,
  active,
}: {
  href: string;
  icon: LucideIcon;
  children: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-subtle"
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-muted')} aria-hidden />
      <span className={cn('flex-1', active ? 'font-medium text-fg' : 'text-muted')}>
        {children}
      </span>
      <ChevronRight className="size-3.5 text-muted" aria-hidden />
    </Link>
  );
}

function PostPreview({ post }: { post: Post }) {
  const { t, formatRelative } = useI18n();
  const name = post.author?.display_name ?? t('common.formerMember');
  const images = post.attachments.filter((attachment) => attachment.kind === 'image').slice(0, 4);
  return (
    <Link
      href={`/feed/${post.id}`}
      className="block rounded-lg px-2 py-3 transition-colors hover:bg-surface-subtle"
    >
      <div className="flex items-center gap-2">
        <Avatar name={name} src={post.author?.avatar_url} size="sm" />
        <span className="truncate text-[13px] font-semibold">{name}</span>
        <span className="shrink-0 text-xs text-muted">· {formatRelative(post.created_at)}</span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm whitespace-pre-line text-fg">{post.content}</p>
      {images.length > 0 && (
        <div className="mt-2 flex gap-1">
          {images.map((image) => (
            <img
              key={image.id}
              src={image.url}
              alt=""
              loading="lazy"
              className="size-16 rounded-md object-cover"
            />
          ))}
        </div>
      )}
    </Link>
  );
}

/** Home: a concise workplace briefing, not a dashboard of metric cards (spec §6). */
export function HomeOverview() {
  const { t, tn, formatDate } = useI18n();
  const { data: me } = useMe();
  const { canAdminister } = useOrganization();
  const orgKey = useOrgKey();
  const feed = useFeed();
  const conversations = useQuery({
    queryKey: orgKey('conversations', 'briefing'),
    queryFn: () => unwrap(api.GET('/api/v1/conversations', { params: { query: { limit: 100 } } })),
  });
  const notifications = useQuery({
    queryKey: orgKey('notifications', 'unread-count'),
    queryFn: () => unwrap(api.GET('/api/v1/notifications/unread-count')),
  });

  const now = new Date();
  const posts = feed.data?.pages[0]?.data ?? [];
  const announcements = posts.filter((post) => post.type === 'ANNOUNCEMENT');
  const recent = posts.filter((post) => post.type !== 'ANNOUNCEMENT').slice(0, 3);
  const unreadMessages = (conversations.data ?? []).reduce(
    (sum, item) => sum + item.unread_count,
    0,
  );
  const unreadNotifications = notifications.data?.unread_count ?? 0;
  const latestAnnouncement = announcements[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-6 md:px-8 md:py-8 lg:flex-row">
      <div className="min-w-0 flex-1">
        {me ? (
          <h1 className="text-title font-semibold tracking-tight">
            {t(greetingKey(now.getHours()), { name: me.display_name })}
          </h1>
        ) : (
          <Skeleton className="h-8 w-64" />
        )}
        <p className="mt-1 text-sm text-muted">
          {formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        {latestAnnouncement && (
          <section className="mt-8" aria-labelledby="home-company">
            <SectionTitle>
              <span id="home-company">{t('home.company')}</span>
            </SectionTitle>
            <Link
              href={`/feed/${latestAnnouncement.id}`}
              className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/40"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase">
                <Megaphone className="size-3.5" aria-hidden />
                {t('feed.announcement')}
              </p>
              <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line text-fg">
                {latestAnnouncement.content}
              </p>
              <p className="mt-2 text-xs text-muted">
                {t('home.publishedBy', {
                  name: latestAnnouncement.author?.display_name ?? t('common.formerMember'),
                })}{' '}
                · {formatDate(latestAnnouncement.created_at, { day: 'numeric', month: 'short' })}
              </p>
            </Link>
          </section>
        )}

        <section className="mt-8" aria-labelledby="home-recent">
          <SectionTitle
            action={
              <Link href="/feed" className="text-xs font-medium text-accent hover:underline">
                {t('home.seeAll')}
              </Link>
            }
          >
            <span id="home-recent">{t('home.recentPosts')}</span>
          </SectionTitle>
          {feed.isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : recent.length === 0 ? (
            <p className="px-2 text-sm text-muted">{t('feed.emptyDescription')}</p>
          ) : (
            <div className="-mx-2 divide-y divide-border">
              {recent.map((post) => (
                <PostPreview key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-8 lg:w-72">
        <section aria-labelledby="home-today">
          <SectionTitle>
            <span id="home-today">{t('home.todayInNexa')}</span>
          </SectionTitle>
          <div className="-mx-2 flex flex-col">
            <BriefingRow href="/messages" icon={MessageSquare} active={unreadMessages > 0}>
              {tn('home.unreadMessages', unreadMessages)}
            </BriefingRow>
            <BriefingRow href="/notifications" icon={Bell} active={unreadNotifications > 0}>
              {tn('home.unreadNotifications', unreadNotifications)}
            </BriefingRow>
            <BriefingRow href="/feed" icon={Megaphone} active={announcements.length > 0}>
              {tn('home.announcements', announcements.length)}
            </BriefingRow>
          </div>
        </section>

        <section aria-labelledby="home-actions">
          <SectionTitle>
            <span id="home-actions">{t('home.quickActions')}</span>
          </SectionTitle>
          <div className="-mx-2 flex flex-col">
            <BriefingRow href="/feed?compose=1" icon={PenSquare} active={false}>
              {t('commands.createPost')}
            </BriefingRow>
            <BriefingRow href="/messages?new=1" icon={MessageSquarePlus} active={false}>
              {t('commands.startMessage')}
            </BriefingRow>
            <BriefingRow href="/channels?create=1" icon={Plus} active={false}>
              {t('commands.createChannel')}
            </BriefingRow>
            {/* Everyone who can open the admin area can invite (member.invite). */}
            {canAdminister && (
              <BriefingRow href="/admin?tab=invitations&invite=1" icon={UserPlus} active={false}>
                {t('home.invitePeople')}
              </BriefingRow>
            )}
          </div>
        </section>

        <SuggestedChannels />
      </aside>
    </div>
  );
}
