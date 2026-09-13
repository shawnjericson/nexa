/**
 * A parsed search request, shared by every module that searches its own data (ADR-018).
 * Modules match with: search_vector @@ to_tsquery('simple', nexa_unaccent(query.tsquery)).
 */
export interface SearchQuery {
  /** The words as typed, folded to lowercase without accents: "Báo cáo" -> ["bao", "cao"]. */
  terms: string[];
  /**
   * Every term as a prefix, all required: "bao:* & cao:*". Terms hold only letters and digits,
   * so user input can never inject tsquery operators.
   */
  tsquery: string;
}

export interface SearchWindow {
  limit: number;
  offset: number;
}

export interface SearchPage<T> {
  items: T[];
  hasMore: boolean;
}

export const emptySearchPage = <T>(): SearchPage<T> => ({ items: [], hasMore: false });

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 50;

/** Lowercase without diacritics, like PostgreSQL's unaccent ("Đ" has no decomposition, hence "d"). */
export function fold(text: string): string {
  return text.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function parseSearchQuery(text: string): SearchQuery {
  const terms = [
    ...new Set(
      fold(text)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((term) => term.slice(0, MAX_TERM_LENGTH)),
    ),
  ].slice(0, MAX_TERMS);
  return { terms, tsquery: terms.map((term) => `${term}:*`).join(' & ') };
}
