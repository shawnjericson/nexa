import type { AuthContext } from './auth-context';
import type { User, UserStatus } from './user';

export interface CreateUserData {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

export interface UpdateProfileData {
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

/** What other modules may know about a user (authors, members, invitees). */
export interface UserSummary {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
}

/** Public read contract of Identity for other modules - they never query users directly. */
export interface UserDirectory {
  getSummaries(ids: readonly string[]): Promise<ReadonlyMap<string, UserSummary>>;
  findByEmail(email: string): Promise<UserSummary | null>;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findSummaries(ids: readonly string[]): Promise<UserSummary[]>;
  findSummaryByEmail(email: string): Promise<UserSummary | null>;
  /** Throws IdentityErrors.emailTaken / usernameTaken on a unique violation. */
  create(data: CreateUserData): Promise<User>;
  /** Throws IdentityErrors.usernameTaken when the new username is taken. */
  updateProfile(id: string, data: UpdateProfileData): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  recordLogin(id: string, at: Date): Promise<User>;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Atomically revokes `currentId` and stores its successor.
   * Returns false when `currentId` was already revoked (a concurrent refresh won the race).
   */
  rotate(currentId: string, next: NewRefreshToken, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  /** Revokes every session of the user except `keepFamilyId`. */
  revokeAllForUser(userId: string, at: Date, keepFamilyId?: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface AccessTokenService {
  issue(context: AuthContext): Promise<{ token: string; expiresIn: number }>;
  /** Throws IdentityErrors.invalidToken / tokenExpired. */
  verify(token: string): Promise<AuthContext>;
}

/**
 * Decides whether one user may see another user's profile. Implemented by the Organization
 * module (shared membership), so Identity never depends on Organization directly.
 */
export interface ProfileVisibility {
  canView(viewerId: string, targetId: string): Promise<boolean>;
}
