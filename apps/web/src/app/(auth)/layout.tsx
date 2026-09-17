import { MessagesSquare, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthArtwork } from '@/components/brand/auth-artwork';
import { Logo } from '@/components/brand/logo';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { getTranslator } from '@/i18n/server';

const FEATURES = [
  { icon: MessagesSquare, label: 'auth.featureChat', hint: 'auth.featureChatHint' },
  { icon: Users, label: 'auth.featureCommunities', hint: 'auth.featureCommunitiesHint' },
  { icon: Zap, label: 'auth.featureProductivity', hint: 'auth.featureProductivityHint' },
] as const;

/**
 * Sign-in and registration: the brand on the left, the form on the right (spec §6). Below lg the
 * brand panel steps aside - on a phone the form is all that matters.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = await getTranslator();
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <AuthArtwork />
        <div className="relative">
          <Link href="/" aria-label="NEXA" className="inline-flex rounded-md">
            <Logo className="text-white" />
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl leading-[1.15] font-semibold text-white">
            {t('auth.brandLine1')}
            <br />
            {t('auth.brandLine2')}
            <br />
            <span className="text-[#7fe4cf]">{t('auth.brandLine3')}</span>
          </h2>
          <p className="mt-4 text-sm leading-6 text-white/70">{t('auth.brandSubtitle')}</p>

          <ul className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6">
            {FEATURES.map((feature) => (
              <li key={feature.label} className="flex items-start gap-2.5">
                <feature.icon className="mt-0.5 size-4 text-[#7fe4cf]" aria-hidden />
                <span>
                  <span className="block text-[13px] font-medium text-white">
                    {t(feature.label)}
                  </span>
                  <span className="block text-xs text-white/60">{t(feature.hint)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-5 lg:justify-end lg:px-10">
          <Link href="/" aria-label="NEXA" className="inline-flex rounded-md lg:hidden">
            <Logo />
          </Link>
          <LanguageSwitch />
        </header>
        <div className="flex flex-1 items-center justify-center px-5 pb-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="px-6 pb-6 text-center text-xs tracking-[0.18em] text-muted lg:text-right lg:pr-10">
          {t('common.tagline')}
        </footer>
      </main>
    </div>
  );
}
