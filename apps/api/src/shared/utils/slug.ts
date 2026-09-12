/**
 * URL-friendly slug that also handles Vietnamese: "Phòng Kỹ thuật" -> "phong-ky-thuat".
 * Returns an empty string when nothing usable is left (e.g. only emoji).
 */
export function slugify(value: string, maxLength = 50): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}
