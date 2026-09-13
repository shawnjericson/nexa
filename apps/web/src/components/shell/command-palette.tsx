'use client';

import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Hash,
  Languages,
  MessageSquarePlus,
  PenSquare,
  Plus,
  SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api/client';
import { ADMIN_ITEM, NAV_SECTIONS, SETTINGS_ITEM } from './navigation';

const OPEN_EVENT = 'nexa:command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function Item({
  icon: Icon,
  onSelect,
  children,
  value,
}: {
  icon: LucideIcon;
  onSelect(): void;
  children: ReactNode;
  value?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg data-[selected=true]:bg-surface-subtle"
    >
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="truncate">{children}</span>
    </Command.Item>
  );
}

const GROUP =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 ' +
  '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted ' +
  '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider';

/**
 * Ctrl/Cmd + K (spec §8): permission-aware navigation and actions. Only destinations the person
 * can already reach are listed; search results join in with the Search milestone.
 */
export function CommandPalette() {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { isManager } = useOrganization();
  const orgKey = useOrgKey();
  const [open, setOpen] = useState(false);

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

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('commands.title')}
      overlayClassName="fixed inset-0 z-40 bg-overlay"
      contentClassName="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
    >
      <Command.Input
        placeholder={t('commands.placeholder')}
        className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-fg outline-none placeholder:text-muted"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
          {t('commands.empty')}
        </Command.Empty>

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
