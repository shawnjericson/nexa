'use client';

import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  FileText,
  Hash,
  Languages,
  MessageSquare,
  MessageSquarePlus,
  PenSquare,
  Plus,
  Search,
  SunMoon,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { conversationTitle } from '@/features/chat/conversation-display';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { searchable, useSearchOverview } from '@/features/search/queries';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api/client';
import { fold } from '@/lib/format';
import type { UserRef } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import { ADMIN_ITEM, NAV_SECTIONS, SETTINGS_ITEM } from './navigation';

const OPEN_EVENT = 'nexa:command-palette';
const RESULTS_PER_KIND = 4;

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Every typed word must appear, ignoring case and accents ("tin nhan" finds "Tin nhắn"). */
function matches(value: string, search: string, keywords?: string[]): number {
  const haystack = fold([value, ...(keywords ?? [])].join(' '));
  const words = fold(search).split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}

const isUser = (user: UserRef | null): user is UserRef => Boolean(user);

function Item({
  icon: Icon,
  onSelect,
  children,
  value,
  keywords,
  hint,
}: {
  icon: LucideIcon;
  onSelect(): void;
  children: ReactNode;
  value?: string;
  keywords?: string[];
  hint?: ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg data-[selected=true]:bg-surface-subtle"
    >
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{hint}</span>}
    </Command.Item>
  );
}

const GROUP =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 ' +
  '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted ' +
  '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider';

/**
 * Ctrl/Cmd + K (spec §8): search, navigation and actions in one place. Everything listed is
 * something the person can already reach: search results come from the API, which only searches
 * what they can see.
 */
export function CommandPalette() {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { isManager } = useOrganization();
  const orgKey = useOrgKey();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const results = useSearchOverview(debounced, RESULTS_PER_KIND, open);

  const { data: channels } = useQuery({
    queryKey: orgKey('channels'),
    queryFn: () => unwrap(api.GET('/api/v1/channels')),
    enabled: open,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Every opening starts from a blank search.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  const go = (href: string) => run(() => router.push(href));
  const pages = [
    ...NAV_SECTIONS.flatMap((section) => section.items),
    SETTINGS_ITEM,
    ...(isManager ? [ADMIN_ITEM] : []),
  ];

  const query = search.trim();
  const found = searchable(query) && searchable(debounced) ? results.data : undefined;
  const people = found?.people.items.filter(isUser) ?? [];
  // Results always match: the server already decided they do (accents, prefixes).
  const always = [search];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('commands.title')}
      filter={matches}
      overlayClassName="fixed inset-0 z-40 bg-overlay"
      contentClassName="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={t('commands.placeholder')}
        className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-fg outline-none placeholder:text-muted"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
          {t('commands.empty')}
        </Command.Empty>

        {searchable(query) && (
          <Command.Group heading={t('search.title')} className={GROUP}>
            <Item
              icon={Search}
              value="search-everything"
              keywords={always}
              hint={results.isFetching ? t('search.searching') : undefined}
              onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)}
            >
              {t('search.searchFor', { query })}
            </Item>
          </Command.Group>
        )}

        {people.length > 0 && (
          <Command.Group heading={t('search.people')} className={GROUP}>
            {people.map((user) => (
              <Item
                key={user.id}
                icon={UserRound}
                value={`person:${user.id}`}
                keywords={always}
                hint={`@${user.username}`}
                onSelect={() => go(`/people/${user.id}`)}
              >
                {user.display_name}
              </Item>
            ))}
          </Command.Group>
        )}

        {found && found.conversations.items.length > 0 && (
          <Command.Group heading={t('search.conversations')} className={GROUP}>
            {found.conversations.items.map((hit) => (
              <Item
                key={hit.id}
                icon={hit.type === 'CHANNEL' ? Hash : Users}
                value={`conversation:${hit.id}`}
                keywords={always}
                hint={hit.joined ? t('search.joined') : undefined}
                onSelect={() => go(hit.joined ? `/messages/${hit.id}` : `/channels?open=${hit.id}`)}
              >
                {hit.name ?? hit.slug}
              </Item>
            ))}
          </Command.Group>
        )}

        {found && found.posts.items.length > 0 && (
          <Command.Group heading={t('search.posts')} className={GROUP}>
            {found.posts.items.map((hit) => (
              <Item
                key={hit.id}
                icon={FileText}
                value={`post:${hit.id}`}
                keywords={always}
                hint={hit.author?.display_name}
                onSelect={() => go(`/feed/${hit.id}`)}
              >
                {hit.snippet.text}
              </Item>
            ))}
          </Command.Group>
        )}

        {found && found.messages.items.length > 0 && (
          <Command.Group heading={t('search.messages')} className={GROUP}>
            {found.messages.items.map((hit) => {
              const title = conversationTitle(hit.conversation, t('common.formerMember'));
              return (
                <Item
                  key={hit.id}
                  icon={MessageSquare}
                  value={`message:${hit.id}`}
                  keywords={always}
                  hint={hit.conversation.type === 'CHANNEL' ? `#${title}` : title}
                  onSelect={() => go(`/messages/${hit.conversation.id}`)}
                >
                  {hit.snippet.text}
                </Item>
              );
            })}
          </Command.Group>
        )}

        <Command.Group heading={t('commands.actions')} className={GROUP}>
          <Item icon={PenSquare} onSelect={() => go('/feed?compose=1')}>
            {t('commands.createPost')}
          </Item>
          <Item icon={MessageSquarePlus} onSelect={() => go('/messages?new=1')}>
            {t('commands.startMessage')}
          </Item>
          <Item icon={Plus} onSelect={() => go('/channels?create=1')}>
            {t('commands.createChannel')}
          </Item>
        </Command.Group>

        <Command.Group heading={t('commands.navigation')} className={GROUP}>
          {pages.map((page) => (
            <Item key={page.href} icon={page.icon} onSelect={() => go(page.href)}>
              {t(page.label)}
            </Item>
          ))}
        </Command.Group>

        {channels && channels.some((channel) => channel.joined) && (
          <Command.Group heading={t('commands.channels')} className={GROUP}>
            {channels
              .filter((channel) => channel.joined)
              .map((channel) => (
                <Item
                  key={channel.id}
                  icon={Hash}
                  value={`#${channel.slug ?? channel.name}`}
                  keywords={channel.name ? [channel.name] : undefined}
                  onSelect={() => go(`/messages/${channel.id}`)}
                >
                  {channel.name}
                </Item>
              ))}
          </Command.Group>
        )}

        <Command.Group heading={t('commands.preferences')} className={GROUP}>
          <Item
            icon={SunMoon}
            onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
          >
            {t('commands.toggleTheme')}
          </Item>
          <Item
            icon={Languages}
            onSelect={() => run(() => i18n.setLocale(i18n.locale === 'vi' ? 'en' : 'vi'))}
          >
            {t('commands.switchLanguage')}
          </Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
