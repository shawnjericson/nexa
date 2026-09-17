'use client';

import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Megaphone,
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
import { conversationTitle, ConversationIcon } from '@/features/chat/conversation-display';
import { PostComposer } from '@/features/feed/composer';
import { useFeed } from '@/features/feed/queries';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { useMembers, usePresence } from '@/features/people/queries';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api/client';
import type { ConversationSummary } from '@/lib/chat-types';
import { cn } from '@/lib/cn';
import type { Member, Post, UserRef } from '@/lib/types';

/** How many conversations, colleagues and posts the page shows before sending you elsewhere. */
const CONVERSATIONS = 5;
const COLLEAGUES = 5;
const POSTS = 4;
/** Someone counts as a new colleague for this long after joining. */
const NEW_COLLEAGUE_DAYS = 30;

type Colleague = Member & { user: UserRef };

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

function ActionRow({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted hover:bg-surface-subtle hover:text-fg"
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/**
 * A conversation worth going back to: who it is with, what was said last, and whether any of it
 * is unread. A count of unread messages tells you a number; this tells you whether to open it.
 */
function ConversationRow({ item, online }: { item: ConversationSummary; online?: boolean }) {
  const { t, formatRelative } = useI18n();
  const title = conversationTitle(item, t('common.formerMember'));
  const unread = item.unread_count > 0;
  const last = item.last_message;
  const preview = last?.deleted
    ? t('chat.deletedMessage')
    : (last?.content ?? (last ? t('chat.sentAttachment') : ''));

  return (
    <Link
      href={`/messages/${item.id}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-subtle"
    >
      <ConversationIcon conversation={item} title={title} size="sm" online={online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={cn('min-w-0 truncate text-[13px]', unread ? 'font-semibold' : '')}>
            {item.type === 'CHANNEL' ? `# ${title}` : title}
          </span>
          {last && (
            <span className="ml-auto shrink-0 text-[11px] text-muted">
              {formatRelative(last.created_at)}
            </span>
          )}
        </span>
        <span className={cn('block truncate text-xs', unread ? 'text-fg' : 'text-muted')}>
          {preview}
        </span>
      </span>
      {unread && (
        <span
          aria-hidden
          className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-accent-contrast"
        >
          {item.unread_count > 99 ? '99+' : item.unread_count}
        </span>
      )}
    </Link>
  );
}

/** Who has just arrived. A new name with a face is easier to greet than a name in a list. */
function ColleagueRow({ member, online }: { member: Colleague; online: boolean }) {
  const { t, formatRelative } = useI18n();
  return (
    <Link
      href={`/people/${member.user.id}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-subtle"
    >
      <Avatar
        name={member.user.display_name}
        src={member.user.avatar_url}
        size="sm"
        presence={online ? 'online' : 'offline'}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{member.user.display_name}</span>
        <span className="block truncate text-xs text-muted">
          {t('home.joined', { when: formatRelative(member.joined_at) })}
        </span>
      </span>
    </Link>
  );
}

/** Every picture a post shows, including the exam contract's image_url - which the feed shows too. */
function imagesOf(post: Post): { key: string; url: string }[] {
  return [
    ...(post.image_url ? [{ key: post.image_url, url: post.image_url }] : []),
    ...post.attachments
      .filter((attachment) => attachment.kind === 'image')
      .map((attachment) => ({ key: attachment.id, url: attachment.url })),
  ];
}

function PostPreview({ post }: { post: Post }) {
  const { t, formatRelative } = useI18n();
  const name = post.author?.display_name ?? t('common.formerMember');
  const images = imagesOf(post).slice(0, 4);
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
              key={image.key}
              src={image.url}
              alt=""
              loading="lazy"
              className="h-16 w-28 rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}
    </Link>
  );
}

/**
 * Home: somewhere to start the day rather than a dashboard of counts (spec §6). You can write a
 * post without going anywhere, pick up the conversations you left, and see who has just joined.
 */
export function HomeOverview() {
  const { t, tn, formatDate } = useI18n();
  const { data: me } = useMe();
  const { canAdminister } = useOrganization();
  const orgKey = useOrgKey();
  const feed = useFeed();
  const members = useMembers();
  const conversations = useQuery({
    queryKey: orgKey('conversations', 'briefing'),
    queryFn: () => unwrap(api.GET('/api/v1/conversations', { params: { query: { limit: 100 } } })),
  });

  const now = new Date();
  const posts = feed.data?.pages[0]?.data ?? [];
  const announcement = posts.find((post) => post.type === 'ANNOUNCEMENT');
  const recent = posts.filter((post) => post.id !== announcement?.id).slice(0, POSTS);

  // Unread first, then whatever was active most recently: the list is never empty for no reason.
  const threads = [...(conversations.data ?? [])]
    .sort(
      (a, b) =>
        Number(b.unread_count > 0) - Number(a.unread_count > 0) ||
        Date.parse(b.last_message?.created_at ?? '') - Date.parse(a.last_message?.created_at ?? ''),
    )
    .slice(0, CONVERSATIONS);

  const people = (members.data ?? []).filter((member): member is Colleague => member.user !== null);
  const newest = [...people]
    .filter(
      (member) =>
        member.user.id !== me?.id &&
        !member.user.deactivated &&
        Date.now() - Date.parse(member.joined_at) < NEW_COLLEAGUE_DAYS * 86_400_000,
    )
    .sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at))
    .slice(0, COLLEAGUES);

  // Everyone in the directory, so "N online" is the whole organization and not just this page;
  // usePresence dedupes, sorts and batches, and the directory asks for the same thing.
  const watched = [
    ...people.map((member) => member.user.id),
    ...threads.flatMap((item) => (item.direct_peer ? [item.direct_peer.id] : [])),
  ];
  const presence = usePresence(watched);
  const onlineCount = people.filter(
    (member) => member.user.id !== me?.id && presence.data?.[member.user.id] === 'online',
  ).length;

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
          {onlineCount > 0 && <> · {tn('home.peopleOnline', onlineCount)}</>}
        </p>

        {/* The point of the page: something you can do here, not a link to somewhere you can. */}
        <div className="mt-6">
          <PostComposer />
        </div>

        {announcement && (
          <section className="mt-8" aria-labelledby="home-company">
            <SectionTitle>
              <span id="home-company">{t('home.company')}</span>
            </SectionTitle>
            <Link
              href={`/feed/${announcement.id}`}
              className="block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-accent/40"
            >
              {imagesOf(announcement)[0] && (
                <img
                  src={imagesOf(announcement)[0]?.url}
                  alt=""
                  className="aspect-[16/7] w-full border-b border-border object-cover"
                />
              )}
              <div className="p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase">
                  <Megaphone className="size-3.5" aria-hidden />
                  {t('feed.announcement')}
                </p>
                <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line text-fg">
                  {announcement.content}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {t('home.publishedBy', {
                    name: announcement.author?.display_name ?? t('common.formerMember'),
                  })}{' '}
                  · {formatDate(announcement.created_at, { day: 'numeric', month: 'short' })}
                </p>
              </div>
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
            <p className="px-2 text-sm text-muted">{t('home.noPostsYet')}</p>
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
        <section aria-labelledby="home-continue">
          <SectionTitle
            action={
              <Link href="/messages" className="text-xs font-medium text-accent hover:underline">
                {t('home.seeAll')}
              </Link>
            }
          >
            <span id="home-continue">{t('home.continueTitle')}</span>
          </SectionTitle>
          {conversations.isPending ? (
            <div className="flex flex-col gap-2 px-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : threads.length === 0 ? (
            <p className="px-2 text-sm text-muted">{t('home.continueEmpty')}</p>
          ) : (
            <div className="-mx-2 flex flex-col">
              {threads.map((item) => (
                <ConversationRow
                  key={item.id}
                  item={item}
                  online={
                    item.direct_peer ? presence.data?.[item.direct_peer.id] === 'online' : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>

        {newest.length > 0 && (
          <section aria-labelledby="home-colleagues">
            <SectionTitle
              action={
                <Link href="/people" className="text-xs font-medium text-accent hover:underline">
                  {t('home.seeAll')}
                </Link>
              }
            >
              <span id="home-colleagues">{t('home.newColleagues')}</span>
            </SectionTitle>
            <div className="-mx-2 flex flex-col">
              {newest.map((member) => (
                <ColleagueRow
                  key={member.user.id}
                  member={member}
                  online={presence.data?.[member.user.id] === 'online'}
                />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="home-actions">
          <SectionTitle>
            <span id="home-actions">{t('home.quickActions')}</span>
          </SectionTitle>
          <div className="-mx-2 flex flex-col">
            <ActionRow href="/feed?compose=1" icon={PenSquare}>
              {t('commands.createPost')}
            </ActionRow>
            <ActionRow href="/messages?new=1" icon={MessageSquarePlus}>
              {t('commands.startMessage')}
            </ActionRow>
            <ActionRow href="/channels?create=1" icon={Plus}>
              {t('commands.createChannel')}
            </ActionRow>
            {/* Everyone who can open the admin area can invite (member.invite). */}
            {canAdminister && (
              <ActionRow href="/admin?tab=invitations&invite=1" icon={UserPlus}>
                {t('home.invitePeople')}
              </ActionRow>
            )}
          </div>
        </section>

        <SuggestedChannels />
      </aside>
    </div>
  );
}
