'use client';

import { unwrap } from '@nexa/api-client';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo, LogoMark } from '@/components/brand/logo';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { ADMIN_ITEM, isActivePath, NAV_SECTIONS, SETTINGS_ITEM, type NavItem } from './navigation';

const PINNED_LIMIT = 8;

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

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 hidden px-2 text-[11px] font-medium tracking-wider text-muted uppercase lg:block">
      {children}
    </p>
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

/** Joined channels, as quick links (spec §3.2 PINNED). */
function PinnedChannels({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const orgKey = useOrgKey();
  const { data } = useQuery({
    queryKey: orgKey('channels'),
    queryFn: () => unwrap(api.GET('/api/v1/channels')),
  });
  const joined = (data ?? [])
    .filter((channel) => channel.joined && !channel.archived)
    .slice(0, PINNED_LIMIT);
  if (joined.length === 0) return null;

  return (
    <div className="hidden lg:block">
      <SectionLabel>{t('nav.pinned')}</SectionLabel>
      {joined.map((channel) => {
        const href = `/messages/${channel.id}`;
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={channel.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-7 items-center gap-2 rounded-md px-2 text-nav transition-colors',
              active
                ? 'bg-surface-subtle text-fg'
                : 'text-muted hover:bg-surface-subtle hover:text-fg',
            )}
          >
            <span aria-hidden className="w-4 text-center text-muted">
              #
            </span>
            <span className="truncate">{channel.slug ?? channel.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { isManager } = useOrganization();

  return (
    <aside className="hidden w-16 shrink-0 flex-col border-r border-border bg-sidebar md:flex lg:w-60">
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
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-2"
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <SectionLabel>{t(section.label)}</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
        <PinnedChannels pathname={pathname} />
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border p-3">
        {isManager && <NavLink item={ADMIN_ITEM} pathname={pathname} />}
        <NavLink item={SETTINGS_ITEM} pathname={pathname} />
      </div>
    </aside>
  );
}
