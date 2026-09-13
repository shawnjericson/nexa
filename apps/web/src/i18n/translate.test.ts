import { describe, expect, it } from 'vitest';
import { en } from './messages/en';
import { vi } from './messages/vi';
import { createTranslator } from './translate';

function keysOf(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string' ? [`${prefix}${key}`] : keysOf(child as object, `${prefix}${key}.`),
  );
}

describe('translations', () => {
  it('provide every Vietnamese key in English, and nothing else', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(vi).sort());
  });

  it('keep the same placeholders in both languages', () => {
    const placeholders = (dictionary: object) =>
      Object.fromEntries(
        keysOf(dictionary).map((key) => {
          const text = createTranslator(dictionary === vi ? 'vi' : 'en').tryT(key) ?? '';
          return [key, (text.match(/\{\w+\}/g) ?? []).sort()];
        }),
      );
    expect(placeholders(en)).toEqual(placeholders(vi));
  });

  it('interpolates values and reports missing keys', () => {
    const { t, tryT } = createTranslator('vi');

    expect(t('home.greetingMorning', { name: 'Lan' })).toBe('Chào buổi sáng, Lan.');
    expect(tryT('errors.codes.SOMETHING_NEW')).toBeUndefined();
  });

  it('formats relative times the way each language says them', () => {
    const now = new Date('2026-09-13T10:00:00Z');
    const viT = createTranslator('vi');
    const enT = createTranslator('en');

    expect(viT.formatRelative(new Date('2026-09-13T09:59:30Z'), now)).toBe('vừa xong');
    expect(enT.formatRelative(new Date('2026-09-13T09:55:00Z'), now)).toBe('5 minutes ago');
    expect(viT.formatRelative(new Date('2026-09-12T10:00:00Z'), now)).toBe('Hôm qua');
    expect(enT.formatRelative(new Date('2026-08-01T10:00:00Z'), now)).toBe('Aug 1, 2026');
  });
});
