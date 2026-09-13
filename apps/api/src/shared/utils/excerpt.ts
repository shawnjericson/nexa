/** A short single-line preview of user content, e.g. for notifications. */
export function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
