import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { getTranslator } from '@/i18n/server';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = await getTranslator();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-6 pb-6 text-center text-xs tracking-[0.18em] text-muted">
        {t('common.tagline')}
      </footer>
    </div>
  );
}
