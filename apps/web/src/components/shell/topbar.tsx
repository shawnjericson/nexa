'use client';

import { Bell, Search } from 'lucide-react';
import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';
import { Kbd } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useUnreadNotificationCount } from '@/features/notifications/queries';
import { useI18n } from '@/i18n/provider';
import { openCommandPalette } from './command-palette';
import { UserMenu } from './user-menu';

function NotificationsButton() {
  const { t } = useI18n();
  const { data } = useUnreadNotificationCount();
  const unread = (data?.unread_count ?? 0) > 0;
  const label = unread
    ? `${t('nav.notifications')} - ${t('shell.unreadNotifications')}`
    : t('nav.notifications');

  return (
    <Tooltip content={t('nav.notifications')}>
      <Button asChild variant="ghost" size="icon" aria-label={label}>
        <Link href="/notifications" className="relative">
          <Bell aria-hidden />
          {/* Restrained unread state: a dot, not a bright count (spec §3.2). */}
          {unread && (
            <span
              aria-hidden
              className="absolute top-2 right-2 size-2 rounded-full bg-accent ring-2 ring-background"
            />
          )}
        </Link>
      </Button>
    </Tooltip>
  );
}

export function Topbar() {
  const { t } = useI18n();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 md:px-5">
      <Link href="/home" aria-label="NEXA" className="rounded-md md:hidden">
        <LogoMark />
      </Link>
      <button
        type="button"
        onClick={openCommandPalette}
        className="hidden h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-[13px] text-muted transition-colors hover:border-muted/40 md:flex"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{t('shell.searchPlaceholder')}</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip content={t('nav.search')}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t('nav.search')}
            onClick={openCommandPalette}
          >
            <Search aria-hidden />
          </Button>
        </Tooltip>
        <NotificationsButton />
        <UserMenu />
      </div>
    </header>
  );
}
