import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from '@/lib/session-cookies';
import { resolveLocale, type Locale } from './config';
import { createTranslator, type Translator } from './translate';

/** The visitor's locale in server components (cookie, else Vietnamese). */
export async function getLocale(): Promise<Locale> {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getTranslator(): Promise<Translator> {
  return createTranslator(await getLocale());
}
