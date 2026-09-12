import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh tokens are opaque 256-bit random strings. Only their SHA-256 hash is stored
 * (risk register 4.5); a salt is unnecessary because the input has full entropy.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
