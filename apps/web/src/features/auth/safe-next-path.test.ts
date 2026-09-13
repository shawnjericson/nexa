import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next-path';

describe('safeNextPath', () => {
  it('keeps paths on this site', () => {
    expect(safeNextPath('/feed')).toBe('/feed');
    expect(safeNextPath('/messages/abc?highlight=12')).toBe('/messages/abc?highlight=12');
  });

  it('refuses anything that could leave the site', () => {
    for (const value of [
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      'feed',
      null,
    ]) {
      expect(safeNextPath(value)).toBe('/home');
    }
  });
});
