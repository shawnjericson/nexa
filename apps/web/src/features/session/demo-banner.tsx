'use client';

import { Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { signOut } from '@/lib/auth/session';
import { isGuestEmail } from '@/lib/guest';
import { useMe } from './use-me';

/**
 * Shown to a demo guest on every page: where they are, and both ways out - an account of their
 * own, or simply leaving. A visitor who can't find the exit from a demo stops trusting it.
 */
export function DemoBanner() {
  const { t } = useI18n();
  const { data: me } = useMe();
  if (!isGuestEmail(me?.email)) return null;

  // A full page load, not a client-side route: the workspace layout sends anyone signed out to
  // the sign-in page, and would otherwise win the race. It also drops everything the guest cached.
  async function leave(to: string) {
    await signOut();
    window.location.replace(to);
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-border bg-accent-soft px-4 py-1.5 text-xs text-accent"
    >
      <span className="inline-flex items-center gap-1.5">
        <Sparkles className="size-3.5" aria-hidden />
        {t('demo.banner')}
      </span>
      <span className="flex gap-3">
        <button
          type="button"
          onClick={() => leave('/register')}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {t('demo.createAccount')}
        </button>
        <button
          type="button"
          onClick={() => leave('/')}
          className="underline-offset-2 hover:underline"
        >
          {t('demo.leave')}
        </button>
      </span>
    </div>
  );
}
