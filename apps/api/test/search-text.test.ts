import { describe, expect, it } from 'vitest';
import { fold, parseSearchQuery } from '../src/shared/search/search-query';
import { snippet } from '../src/shared/search/snippet';

const highlighted = (result: ReturnType<typeof snippet>) =>
  result.highlights.map(([start, end]) => result.text.slice(start, end));

describe('search queries', () => {
  it('folds Vietnamese to lowercase words without accents', () => {
    expect(fold('Báo cáo Đà Nẵng ỆỀỂ')).toBe('bao cao da nang eee');
    expect(parseSearchQuery('  Báo cáo, "Đà Nẵng"! ')).toEqual({
      terms: ['bao', 'cao', 'da', 'nang'],
      tsquery: 'bao:* & cao:* & da:* & nang:*',
    });
  });

  it('never lets input become tsquery syntax', () => {
    expect(parseSearchQuery("a:* | b & !c <-> d'); DROP TABLE posts; --").tsquery).toBe(
      'a:* & b:* & c:* & d:* & drop:* & table:* & posts:*',
    );
    expect(parseSearchQuery('!!! ???')).toEqual({ terms: [], tsquery: '' });
  });

  it('keeps at most 8 distinct terms', () => {
    expect(parseSearchQuery('a b c d e f g h i j a b').terms).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
  });
});

describe('snippets', () => {
  it('locates accent-insensitive prefix matches in the original text', () => {
    const result = snippet('Báo cáo phát triển sản phẩm Q3', ['bao', 'phat']);

    expect(result.text).toBe('Báo cáo phát triển sản phẩm Q3');
    expect(highlighted(result)).toEqual(['Báo', 'phát']);
  });

  it('only highlights matches at the start of a word', () => {
    expect(highlighted(snippet('Kế hoạch học tập', ['hoc']))).toEqual(['học']);
  });

  it('cuts long text around the first match', () => {
    const text = `${'Mở đầu dài dòng. '.repeat(20)}Họp về ngân sách vào thứ Sáu. ${'Kết thúc. '.repeat(20)}`;

    const result = snippet(text, ['ngan', 'sach']);

    expect(result.text.startsWith('…')).toBe(true);
    expect(result.text.endsWith('…')).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(162);
    expect(highlighted(result)).toEqual(['ngân', 'sách']);
  });

  it('merges overlapping matches and collapses whitespace', () => {
    const result = snippet('Nguyễn\n\nVăn   An', ['ng', 'nguyen']);

    expect(result.text).toBe('Nguyễn Văn An');
    expect(highlighted(result)).toEqual(['Nguyễn']);
  });
});
