import { describe, expect, it } from 'vitest';
import { vi } from '@/i18n/messages/vi';
import { fold } from '@/lib/format';
import { ALL_EMOJI, EMOJI_GROUPS } from './emoji-data';

/** The picker's own search, kept here so the data and the filter are tested together. */
const search = (query: string) =>
  ALL_EMOJI.filter(([, keywords]) => fold(keywords).includes(fold(query.trim()))).map(
    ([emoji]) => emoji,
  );

describe('emoji data', () => {
  it('lists every emoji once, with keywords', () => {
    const emoji = ALL_EMOJI.map(([character]) => character);
    expect(new Set(emoji).size).toBe(emoji.length);
    expect(ALL_EMOJI.every(([, keywords]) => keywords.trim().length > 0)).toBe(true);
    expect(EMOJI_GROUPS.every((group) => group.items.length > 0)).toBe(true);
  });

  it('names every group in the dictionaries', () => {
    const groups: Record<string, string> = vi.chat.emoji.groups;
    for (const group of EMOJI_GROUPS) expect(groups[group.id]).toBeTruthy();
  });

  it('searches in Vietnamese and English, with or without accents', () => {
    expect(search('cười')).toContain('😀');
    expect(search('cuoi')).toContain('😀');
    expect(search('grin')).toContain('😀');
    expect(search('cảm ơn')).toContain('🙏');
    expect(search('camon')).toEqual([]);
    expect(search('deadline')).toContain('⏰');
  });
});
