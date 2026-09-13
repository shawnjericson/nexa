export interface SnippetPart {
  text: string;
  match: boolean;
}

/**
 * Splits a search snippet into plain and matched parts. The API sends [start, end) ranges in
 * JavaScript string offsets; they are clamped, sorted and de-overlapped here so a bad range can
 * never lose or duplicate text.
 */
export function snippetParts(text: string, highlights: number[][]): SnippetPart[] {
  const ranges = highlights
    .map(([start = 0, end = 0]) => [Math.max(0, start), Math.min(text.length, end)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  const parts: SnippetPart[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) parts.push({ text: text.slice(cursor, from), match: false });
    const previous = parts.at(-1);
    // Touching ranges become one mark, so a phrase is highlighted as one piece.
    if (previous?.match && from === cursor) previous.text += text.slice(from, end);
    else parts.push({ text: text.slice(from, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
