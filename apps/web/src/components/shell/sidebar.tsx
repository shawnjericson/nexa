'use client';

import { ChevronsUpDown, Hash, Plus, SquarePen, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/brand/logo';
import { Avatar } from '@/components/ui/avatar';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { conversationTitle } from '@/features/chat/conversation-display';
import { useConversations } from '@/features/chat/queries';
import { useOrganization } from '@/features/organization/organization-provider';
import { usePresence } from '@/features/people/queries';
import { useI18n } from '@/i18n/provider';
import type { ConversationSummary } from '@/lib/chat-types';
import { cn } from '@/lib/cn';
import { ADMIN_ITEM, isActivePath, PRIMARY_ITEMS, SETTINGS_ITEM, type NavItem } from './navigation';

/** How many conversations of each kind the sidebar shows before "see all". */
const LIST_LIMIT = 8;

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { t } = useI18n();
  const active = isActivePath(pathname, item.href);
  const label = t(item.label);
  return (
    <Tooltip content={label} side="right">
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center gap-2.5 rounded-md px-2 text-nav font-medium transition-colors',
          'justify-center lg:justify-start',
          active ? 'bg-surface-subtle text-fg' : 'text-muted hover:bg-surface-subtle hover:text-fg',
        )}
      >
        <item.icon className="size-4 shrink-0" aria-hidden />
        <span className="sr-only truncate lg:not-sr-only">{label}</span>
      </Link>
    </Tooltip>
  );
}

function OrganizationSwitcher() {
  const { t } = useI18n();
  const { organization, organizations, switchTo } = useOrganization();
  if (organizations.length < 2) {
    return <p className="hidden truncate px-2 text-xs text-muted lg:block">{organization.name}</p>;
  }
  return (
    <Menu>
      <MenuTrigger className="hidden h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs text-muted hover:bg-surface-subtle hover:text-fg lg:flex">
        <span className="truncate">{organization.name}</span>
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{t('shell.switchOrganization')}</span>
      </MenuTrigger>
      <MenuContent align="start" className="w-56">
        <MenuLabel>{t('shell.switchOrganization')}</MenuLabel>
        <MenuRadioGroup value={organization.id} onValueChange={switchTo}>
          {organizations.map((item) => (
            <MenuRadioItem key={item.id} value={item.id}>
              <span className="truncate">{item.name}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** A section of conversations: a heading, one action, and the rows themselves. */
function ListSection({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="hidden lg:block">
      <div className="mb-1 flex h-6 items-center gap-1 px-2">
        <p className="flex-1 text-[11px] font-medium tracking-wider text-muted uppercase">
          {title}
        </p>
        {action}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SectionAction({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Tooltip content={label}>
      <Link
        href={href}
        className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-surface-subtle hover:text-fg"
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </Link>
    </Tooltip>
  );
}

function ConversationLink({
  item,
  pathname,
  online,
}: {
  item: ConversationSummary;
  pathname: string;
  online?: boolean;
}) {
  const { t } = useI18n();
  const href = `/messages/${item.id}`;
  const active = isActivePath(pathname, href);
  const title = conversationTitle(item, t('common.formerMember'));
  const unread = item.unread_count > 0;

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center gap-2 rounded-md px-2 text-nav transition-colors',
        active
          ? 'bg-surface-subtle text-fg'
          : unread
            ? 'font-medium text-fg hover:bg-surface-subtle'
            : 'text-muted hover:bg-surface-subtle hover:text-fg',
      )}
    >
      {item.type === 'CHANNEL' ? (
        <span aria-hidden className="w-4 shrink-0 text-center">
          #
        </span>
      ) : item.type === 'GROUP' ? (
        <Users className="size-4 shrink-0" aria-hidden />
      ) : (
        <Avatar
          name={title}
          src={item.direct_peer?.avatar_url}
          size="xs"
          presence={online === undefined ? null : online ? 'online' : 'offline'}
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        {item.type === 'CHANNEL' ? (item.slug ?? title) : title}
      </span>
      {unread && (
        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-contrast">
          {item.unread_count > 99 ? '99+' : item.unread_count}
        </span>
      )}
    </Link>
  );
}

function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-7 items-center rounded-md px-2 text-xs text-muted hover:bg-surface-subtle hover:text-fg"
    >
      {children}
    </Link>
  );
}

/** Channels and people, straight in the sidebar: the switcher people actually use (spec §6). */
function Conversations({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const conversations = useConversations();
  const items = conversations.data?.pages.flatMap((page) => page.data) ?? [];
  const channels = items.filter((item) => item.type === 'CHANNEL');
  const chats = items.filter((item) => item.type !== 'CHANNEL');
  const peerIds = chats.flatMap((item) => (item.direct_peer ? [item.direct_peer.id] : []));
  const presence = usePresence(peerIds);

  return (
    <>
      <ListSection
        title={t('chat.channels')}
        action={
          <SectionAction href="/channels?create=1" label={t('channels.create')} icon={Plus} />
        }
      >
        {channels.slice(0, LIST_LIMIT).map((item) => (
          <ConversationLink key={item.id} item={item} pathname={pathname} />
        ))}
        <SeeAll href="/channels">
          {channels.length > LIST_LIMIT ? t('home.seeAll') : t('channels.title')}
        </SeeAll>
      </ListSection>

      <ListSection
        title={t('chat.direct')}
        action={
          <SectionAction
            href="/messages?new=1"
            label={t('chat.newConversation')}
            icon={SquarePen}
          />
        }
      >
        {chats.slice(0, LIST_LIMIT).map((item) => (
          <ConversationLink
            key={item.id}
            item={item}
            pathname={pathname}
            online={
              item.direct_peer ? presence.data?.[item.direct_peer.id] === 'online' : undefined
            }
          />
        ))}
        {chats.length > LIST_LIMIT && <SeeAll href="/messages">{t('home.seeAll')}</SeeAll>}
        {chats.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted">{t('chat.emptyListDescription')}</p>
        )}
      </ListSection>
    </>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { canAdminister } = useOrganization();

  return (
    <aside className="hidden w-16 shrink-0 flex-col border-r border-border bg-sidebar md:flex lg:w-64">
      <div className="flex h-14 items-center justify-center px-4 lg:justify-start">
        <Link href="/home" aria-label="NEXA" className="rounded-md">
          <LogoMark className="lg:hidden" />
          <Logo className="hidden lg:inline-flex" />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <OrganizationSwitcher />
      </div>

      <nav
        aria-label={t('nav.primary')}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2"
      >
        <div className="flex flex-col gap-0.5">
          {PRIMARY_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          {/* Icon rail (md): conversations live behind these two. */}
          <div className="flex flex-col gap-0.5 lg:hidden">
            <NavLink
              item={{ href: '/messages', label: 'nav.messages', icon: SquarePen }}
              pathname={pathname}
            />
            <NavLink
              item={{ href: '/channels', label: 'nav.channels', icon: Hash }}
              pathname={pathname}
            />
          </div>
        </div>
        <Conversations pathname={pathname} />
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border p-3">
        {canAdminister && <NavLink item={ADMIN_ITEM} pathname={pathname} />}
        <NavLink item={SETTINGS_ITEM} pathname={pathname} />
      </div>
    </aside>
  );
}
