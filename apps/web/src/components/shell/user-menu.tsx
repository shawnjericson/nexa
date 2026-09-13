'use client';

import { Languages, LogOut, Monitor, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ui/menu';
import { useOrganization } from '@/features/organization/organization-provider';
import { useMe } from '@/features/session/use-me';
import { LOCALE_NAMES, LOCALES, resolveLocale } from '@/i18n/config';
import { useI18n } from '@/i18n/provider';
import { signOut } from '@/lib/auth/session';

export function UserMenu() {
  const { t, tryT, locale, setLocale } = useI18n();
  const { theme = 'system', setTheme } = useTheme();
  const { organization } = useOrganization();
  const { data: me } = useMe();
  const router = useRouter();
  const name = me?.display_name ?? '';

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <Menu>
      <MenuTrigger
        className="ml-1 inline-flex rounded-full outline-offset-2"
        aria-label={t('shell.userMenu')}
      >
        <Avatar name={name || '?'} src={me?.avatar_url} size="sm" />
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={name || '?'} src={me?.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">
              {me ? `@${me.username}` : ''} ·{' '}
              {tryT(`organization.roles.${organization.role}`) ?? organization.role}
            </p>
          </div>
        </div>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href={me ? `/people/${me.id}` : '/people'}>
            <UserRound aria-hidden />
            {t('nav.profile')}
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            {t('nav.settings')}
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            {theme === 'dark' ? (
              <Moon aria-hidden />
            ) : theme === 'light' ? (
              <Sun aria-hidden />
            ) : (
              <Monitor aria-hidden />
            )}
            {t('shell.theme')}
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup value={theme} onValueChange={setTheme}>
              <MenuRadioItem value="light">{t('shell.themeLight')}</MenuRadioItem>
              <MenuRadioItem value="dark">{t('shell.themeDark')}</MenuRadioItem>
              <MenuRadioItem value="system">{t('shell.themeSystem')}</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuSub>
          <MenuSubTrigger>
            <Languages aria-hidden />
            {t('shell.language')}
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup
              value={locale}
              onValueChange={(value) => setLocale(resolveLocale(value))}
            >
              {LOCALES.map((item) => (
                <MenuRadioItem key={item} value={item} lang={item}>
                  {LOCALE_NAMES[item]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuSeparator />
        <MenuItem onSelect={handleSignOut}>
          <LogOut aria-hidden />
          {t('auth.signOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
