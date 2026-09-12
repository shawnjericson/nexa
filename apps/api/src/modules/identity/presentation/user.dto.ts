import type { AuthTokens } from '../application/auth.service';
import type { UserSummary } from '../domain/ports';
import type { User } from '../domain/user';

/**
 * Compact reference to a user inside other modules' responses (authors, members). No email.
 * Content keeps its author after deactivation; clients show them as a former member (7.5, 12.4).
 */
export function toUserReference(user: UserSummary | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    deactivated: user.status !== 'ACTIVE',
  };
}

/** Public profile. The password hash never leaves the Identity module. */
export function toProfileResponse(user: User) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

export function toMeResponse(user: User) {
  return {
    ...toProfileResponse(user),
    last_login_at: user.lastLoginAt?.toISOString() ?? null,
  };
}

export function toTokensResponse(tokens: AuthTokens) {
  return {
    token_type: 'Bearer' as const,
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
  };
}
