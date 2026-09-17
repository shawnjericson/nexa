import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, localeFromAcceptLanguage } from './config';

describe('localeFromAcceptLanguage', () => {
  it.each([
    ['vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7', 'vi'],
    ['en-US,en;q=0.9,vi;q=0.8', 'en'],
    ['en-GB', 'en'],
    ['EN', 'en'],
  ])('picks the first language NEXA speaks: %s', (header, locale) => {
    expect(localeFromAcceptLanguage(header)).toBe(locale);
  });

  it('ranks by quality before order', () => {
    expect(localeFromAcceptLanguage('en;q=0.5, vi;q=0.9')).toBe('vi');
    expect(localeFromAcceptLanguage('vi;q=0, en;q=0.1')).toBe('en');
  });

  it('skips languages NEXA does not have', () => {
    expect(localeFromAcceptLanguage('ja-JP,ja;q=0.9,vi;q=0.5')).toBe('vi');
  });

  it('answers in English when none of the languages is available', () => {
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9,de;q=0.8')).toBe('en');
  });

  it('keeps the default with no preference at all', () => {
    for (const header of [null, undefined, '', '   ', '*', 'fr;q=0', 'garbage;q=x']) {
      expect(localeFromAcceptLanguage(header)).toBe(DEFAULT_LOCALE);
    }
  });
});
