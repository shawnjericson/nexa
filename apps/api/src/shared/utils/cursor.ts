import { z } from 'zod';
import { AppError } from '../errors/app-error';

/** Keyset position: the (timestamp, id) of the last row of the previous page. */
export interface Keyset {
  at: Date;
  id: string;
}

const Payload = z.object({ t: z.iso.datetime(), id: z.uuid() });

/** Opaque to clients: base64url JSON of the keyset. */
export function encodeKeyset(keyset: Keyset): string {
  return Buffer.from(JSON.stringify({ t: keyset.at.toISOString(), id: keyset.id })).toString(
    'base64url',
  );
}

export function decodeKeyset(value: string): Keyset {
  try {
    const payload = Payload.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return { at: new Date(payload.t), id: payload.id };
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid');
  }
}
