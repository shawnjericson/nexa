import { describe, expect, it } from 'vitest';
import { snippetParts } from './snippet';

const join = (parts: ReturnType<typeof snippetParts>) => parts.map((part) => part.text).join('');

describe('snippetParts', () => {
  it('marks the highlighted ranges', () => {
    expect(
      snippetParts('Báo cáo quý ba', [
        [0, 3],
        [4, 7],
      ]),
    ).toEqual([
      { text: 'Báo', match: true },
      { text: ' ', match: false },
      { text: 'cáo', match: true },
      { text: ' quý ba', match: false },
    ]);
  });

  it('returns the whole text unmarked without highlights', () => {
    expect(snippetParts('Xin chào', [])).toEqual([{ text: 'Xin chào', match: false }]);
  });

  it('sorts, merges overlaps and clamps out-of-range offsets without losing text', () => {
    const text = 'kế hoạch sản xuất';
    const parts = snippetParts(text, [
      [9, 12],
      [-4, 2],
      [10, 99],
      [5, 5],
    ]);
    expect(join(parts)).toBe(text);
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(['kế', 'sản xuất']);
  });
});
