import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE } from '@/lib/session-cookies';
import { localeFromAcceptLanguage, resolveLocale, type Locale } from './config';
import { createTranslator, type Translator } from './translate';

/** The visitor's locale in server components: the one they picked, else their browser's. */
export async function getLocale(): Promise<Locale> {
  const picked = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (picked) return resolveLocale(picked);
  return localeFromAcceptLanguage((await headers()).get('accept-language'));
}

export async function getTranslator(): Promise<Translator> {
  return createTranslator(await getLocale());
}
