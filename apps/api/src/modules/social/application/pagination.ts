import { z } from 'zod';
import type { KeysetCursor } from '../domain/ports';
import { SocialErrors } from '../domain/social-errors';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasNext: boolean;
}

export interface OffsetPage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

const CursorPayload = z.object({ t: z.iso.datetime(), id: z.uuid() });

/** Opaque to clients: base64url of the (created_at, id) of the last row they received. */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  const payload = JSON.stringify({ t: row.createdAt.toISOString(), id: row.id });
  return Buffer.from(payload).toString('base64url');
}

export function decodeCursor(value: string): KeysetCursor {
  try {
    const json: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const payload = CursorPayload.parse(json);
    return { createdAt: new Date(payload.t), id: payload.id };
  } catch {
    throw SocialErrors.invalidCursor();
  }
}

/** Repositories fetch `limit + 1` rows; the extra row only signals that another page exists. */
export function toCursorPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, hasNext, nextCursor: hasNext && last ? encodeCursor(last) : null };
}
