export const LOCALES = ['vi', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** Vietnamese first; English is one click away (decided 2026-09-13). */
export const DEFAULT_LOCALE: Locale = 'vi';

/** BCP 47 tags for Intl formatting. */
export const INTL_LOCALES: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

export const LOCALE_NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' };

export function resolveLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}
