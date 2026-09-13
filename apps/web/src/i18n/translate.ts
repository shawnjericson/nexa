import { INTL_LOCALES, type Locale } from './config';
import { en } from './messages/en';
import { vi } from './messages/vi';

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** The shape every dictionary must have: the Vietnamese one, with any string values. */
export type Messages = DeepStrings<typeof vi>;

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

type PluralKeys<T> = {
  [K in keyof T & string]: T[K] extends { other: string }
    ? K
    : T[K] extends string
      ? never
      : `${K}.${PluralKeys<T[K]>}`;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
/** Keys whose value is { one, other } (and optionally other Intl plural categories). */
export type PluralKey = PluralKeys<Messages>;
export type Values = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Messages> = { vi, en };

function lookup(messages: Messages, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, messages);
}

function interpolate(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export interface Translator {
  locale: Locale;
  t(key: MessageKey, values?: Values): string;
  /** Plural-aware: picks the key's `one`/`other` form for `count` (available as {count}). */
  tn(key: PluralKey, count: number, values?: Values): string;
  /** Looks up a key built at runtime (e.g. an API error code); undefined when missing. */
  tryT(key: string, values?: Values): string | undefined;
  formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string;
  formatTime(date: Date | string): string;
  /** "vừa xong", "5 phút trước", "hôm qua"... and a date beyond a week. */
  formatRelative(date: Date | string, now?: Date): string;
  formatNumber(value: number): string;
}

const toDate = (value: Date | string) => (typeof value === 'string' ? new Date(value) : value);

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60],
  ['hour', 60 * 60],
  ['day', 24 * 60 * 60],
];

export function createTranslator(locale: Locale): Translator {
  const messages = DICTIONARIES[locale];
  const intl = INTL_LOCALES[locale];
  const plurals = new Intl.PluralRules(intl);
  const relative = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });
  const numbers = new Intl.NumberFormat(intl);

  const tryT = (key: string, values?: Values) => {
    const found = lookup(messages, key);
    return typeof found === 'string' ? interpolate(found, values) : undefined;
  };

  const formatDate: Translator['formatDate'] = (date, options) =>
    new Intl.DateTimeFormat(
      intl,
      options ?? { day: 'numeric', month: 'long', year: 'numeric' },
    ).format(toDate(date));

  return {
    locale,
    tryT,
    t: (key, values) => tryT(key, values) ?? key,
    tn: (key, count, values) => {
      const forms = lookup(messages, key) as Record<string, string> | undefined;
      const template = forms?.[plurals.select(count)] ?? forms?.other ?? key;
      return interpolate(template, { count: numbers.format(count), ...values });
    },
    formatDate,
    formatTime: (date) =>
      new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit' }).format(toDate(date)),
    formatRelative: (date, now = new Date()) => {
      const seconds = (toDate(date).getTime() - now.getTime()) / 1000;
      if (Math.abs(seconds) < 60) return messages.time.justNow;
      for (let i = RELATIVE_STEPS.length - 1; i >= 0; i -= 1) {
        const [unit, size] = RELATIVE_STEPS[i] as [Intl.RelativeTimeFormatUnit, number];
        if (Math.abs(seconds) >= size) {
          if (unit === 'day' && Math.abs(seconds) >= 7 * size) {
            return formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
          }
          return relative.format(Math.round(seconds / size), unit);
        }
      }
      return messages.time.justNow;
    },
    formatNumber: (value) => numbers.format(value),
  };
}
