export const LOCALES = ['vi', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Vietnamese first; English is one click away (decided 2026-09-13). A first visit follows the
 * browser's languages instead (2026-09-17), so someone who doesn't read Vietnamese isn't greeted in it.
 */
export const DEFAULT_LOCALE: Locale = 'vi';

/** BCP 47 tags for Intl formatting. */
export const INTL_LOCALES: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

export const LOCALE_NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' };

/**
 * The locale for a visitor who hasn't picked one: the first of the browser's languages NEXA speaks
 * (by quality, then order). A browser that asks only for other languages gets English, the better
 * guess for someone who doesn't read Vietnamese; no header at all, as from most crawlers, or a
 * bare `*` keeps the default.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const ranked = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.split(';').map((item) => item.trim());
      const q = params.find((param) => param.startsWith('q='));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.toLowerCase().split('-')[0] ?? '', quality, index };
    })
    .filter((item) => item.language !== '' && Number.isFinite(item.quality) && item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { language } of ranked) {
    if (language === '*') return DEFAULT_LOCALE;
    if ((LOCALES as readonly string[]).includes(language)) return language as Locale;
  }
  return ranked.length > 0 ? 'en' : DEFAULT_LOCALE;
}

export function resolveLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}
