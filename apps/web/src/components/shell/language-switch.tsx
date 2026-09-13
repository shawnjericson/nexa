'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALE_NAMES } from '@/i18n/config';
import { useI18n } from '@/i18n/provider';

/** One-click switch between Vietnamese and English (for the sign-in pages). */
export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  const next = locale === 'vi' ? 'en' : 'vi';
  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(next)} lang={next}>
      <Languages aria-hidden />
      {LOCALE_NAMES[next]}
    </Button>
  );
}
