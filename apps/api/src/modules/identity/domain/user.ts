export type UserStatus = 'ACTIVE' | 'DEACTIVATED';

/**
 * Stored instead of a hash for accounts nobody signs in to with a password: demo guests, and
 * accounts created through Google. Not a bcrypt hash, so no password ever matches it - and
 * making one costs nothing, where hashing a random secret cost a quarter of a second each.
 */
export const NO_PASSWORD = '!';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
