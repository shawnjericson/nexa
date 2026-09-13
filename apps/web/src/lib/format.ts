import { INTL_LOCALES, type Locale } from '@/i18n/config';

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/** "2,4 MB" in Vietnamese, "2.4 MB" in English. */
export function formatBytes(bytes: number, locale: Locale): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'unit',
    unit: UNITS[unit] ?? 'byte',
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** Lowercase without accents, so "nguyen" finds "Nguyễn" (same folding as the API's search). */
export function fold(text: string): string {
  return text.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
