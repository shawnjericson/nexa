'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { isActivePath, MOBILE_ITEMS } from './navigation';

/** Bottom navigation below 768px: the four most frequent destinations (spec §13). */
export function MobileNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('nav.primary')}
      className="grid shrink-0 grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              active ? 'text-accent' : 'text-muted',
            )}
          >
            <item.icon className="size-5" aria-hidden />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
