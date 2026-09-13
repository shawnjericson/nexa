import { fold } from './search-query';

export interface Snippet {
  text: string;
  /** [start, end) of each matched word prefix within `text`, as JavaScript string offsets. */
  highlights: Array<[number, number]>;
}

const SNIPPET_LENGTH = 160;
/** Context kept before the first match. */
const LEAD = 40;

/** Folds text character by character, remembering where each folded character came from. */
function foldWithOffsets(text: string): { folded: string; offsets: number[] } {
  let folded = '';
  const offsets: number[] = [];
  let index = 0;
  for (const char of text) {
    const foldedChar = fold(char);
    for (let i = 0; i < foldedChar.length; i += 1) offsets.push(index);
    folded += foldedChar;
    index += char.length;
  }
  offsets.push(index);
  return { folded, offsets };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Positions (in the original text) where a word starts with one of the terms. */
function findMatches(text: string, terms: readonly string[]): Array<[number, number]> {
  const { folded, offsets } = foldWithOffsets(text);
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}`, 'gu');
    for (const match of folded.matchAll(pattern)) {
      ranges.push([offsets[match.index] ?? 0, offsets[match.index + term.length] ?? text.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  // Overlapping terms ("ng" and "nguyen") highlight once.
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/**
 * The part of the text around the first match, with the matches located, so clients can
 * highlight them without re-implementing accent-insensitive matching.
 */
export function snippet(
  text: string,
  terms: readonly string[],
  maxLength = SNIPPET_LENGTH,
): Snippet {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const matches = findMatches(normalized, terms);

  let start = 0;
  if (normalized.length > maxLength) {
    const first = matches[0]?.[0] ?? 0;
    start = Math.max(0, Math.min(first - LEAD, normalized.length - maxLength));
    // Begin at the start of a word when one is close.
    const space = normalized.lastIndexOf(' ', start);
    if (start > 0 && space >= 0 && start - space < 15) start = space + 1;
  }
  const end = Math.min(normalized.length, start + maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';

  return {
    text: `${prefix}${normalized.slice(start, end)}${suffix}`,
    highlights: matches
      .filter(([from, to]) => from >= start && to <= end)
      .map(([from, to]) => [from - start + prefix.length, to - start + prefix.length]),
  };
}
