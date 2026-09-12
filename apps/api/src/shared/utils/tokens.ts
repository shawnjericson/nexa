import { createHash, randomBytes } from 'node:crypto';

/**
 * A 256-bit random, URL-safe token (invitation links and the like). Persist only the hash;
 * no salt is needed because the token has full entropy.
 */
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
