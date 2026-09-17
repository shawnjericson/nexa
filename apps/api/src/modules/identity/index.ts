import type { RequestHandler, Router } from 'express';
import type { Env } from '../../config/env';
import type { PrismaClient } from '../../generated/prisma/client';
import type { EventBus } from '../../shared/events/event-bus';
import { AuthService } from './application/auth.service';
import { UserService } from './application/user.service';
import type {
  AvatarWriter,
  ExternalIdentityVerifier,
  ProfileVisibility,
  UserDirectory,
} from './domain/ports';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { GoogleIdTokenVerifier } from './infrastructure/google-id-token.verifier';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { JwtAccountLinkTokens } from './infrastructure/jwt-account-link-tokens';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository';
import { PrismaUserSearch } from './infrastructure/prisma-user-search';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { createAuthRouter } from './presentation/auth.routes';
import './presentation/openapi';
import {
  createAuthenticator,
  createRequireAuth,
  type Authenticate,
} from './presentation/require-auth';
import { createForbidGuests } from './presentation/forbid-guests';
import { createUsersRouter } from './presentation/users.routes';

// Public contract of the Identity module - other modules import only from here.
export type { AuthContext } from './domain/auth-context';
export {
  GUEST_CREATED,
  USER_REGISTERED,
  type GuestCreatedEvent,
  type UserRegisteredEvent,
} from './domain/events';
export { GUEST_EMAIL_DOMAIN, isGuestEmail } from './domain/guest';
export type {
  AvatarWriter,
  ExternalIdentityVerifier,
  ProfileVisibility,
  UserDirectory,
  UserSummary,
} from './domain/ports';
export { requireAuthContext, type Authenticate } from './presentation/require-auth';
export { UserReference } from './presentation/schemas';
export { toUserReference } from './presentation/user.dto';

export type IdentityConfig = Pick<
  Env,
  | 'JWT_ACCESS_SECRET'
  | 'JWT_ACCESS_TTL_SECONDS'
  | 'REFRESH_TOKEN_TTL_DAYS'
  | 'REFRESH_REUSE_GRACE_SECONDS'
  | 'BCRYPT_ROUNDS'
  | 'GOOGLE_CLIENT_ID'
  | 'DEMO_ORG_SLUG'
>;

export interface IdentityModule {
  /** Refuses demo guests; mount after requireAuth on routes that need a real account. */
  forbidGuests: RequestHandler;
  authRouter: Router;
  usersRouter: Router;
  requireAuth: RequestHandler;
  /** Same checks as requireAuth, for non-HTTP transports (WebSocket handshakes). */
  authenticate: Authenticate;
  userDirectory: UserDirectory;
  /** For the File module: uploaded pictures as avatars. */
  avatars: AvatarWriter;
}

export function createIdentityModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  profileVisibility: ProfileVisibility;
  config: IdentityConfig;
  /**
   * Google ID token verification. Defaults to Google's published keys when GOOGLE_CLIENT_ID is
   * set (tests pass their own keys); null turns Google sign-in off.
   */
  externalIdentity?: ExternalIdentityVerifier | null;
}): IdentityModule {
  const { prisma, events, profileVisibility, config } = deps;

  const users = new PrismaUserRepository(prisma);
  const userSearch = new PrismaUserSearch(prisma);
  const accessTokens = new JwtAccessTokenService(
    config.JWT_ACCESS_SECRET,
    config.JWT_ACCESS_TTL_SECONDS,
  );
  const externalIdentity =
    deps.externalIdentity !== undefined
      ? deps.externalIdentity
      : config.GOOGLE_CLIENT_ID
        ? new GoogleIdTokenVerifier(config.GOOGLE_CLIENT_ID)
        : null;
  const auth = new AuthService({
    users,
    refreshTokens: new PrismaRefreshTokenRepository(prisma),
    passwords: new BcryptPasswordHasher(config.BCRYPT_ROUNDS),
    accessTokens,
    events,
    settings: {
      refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      refreshReuseGraceSeconds: config.REFRESH_REUSE_GRACE_SECONDS,
    },
    externalIdentity,
    linkTokens: new JwtAccountLinkTokens(config.JWT_ACCESS_SECRET),
  });
  const authenticate = createAuthenticator({ accessTokens, users });
  const requireAuth = createRequireAuth(authenticate);

  return {
    requireAuth,
    forbidGuests: createForbidGuests(users),
    authenticate,
    authRouter: createAuthRouter({ auth, requireAuth, demoEnabled: Boolean(config.DEMO_ORG_SLUG) }),
    usersRouter: createUsersRouter({
      users: new UserService({ users, visibility: profileVisibility }),
      requireAuth,
    }),
    userDirectory: {
      async getSummaries(ids) {
        const summaries = await users.findSummaries(ids);
        return new Map(summaries.map((summary) => [summary.id, summary]));
      },
      findByEmail: (email) => users.findSummaryByEmail(email),
      search: (query, options) => userSearch.search(query, options),
    },
    avatars: { set: (userId, avatar) => users.updateAvatar(userId, avatar) },
  };
}
