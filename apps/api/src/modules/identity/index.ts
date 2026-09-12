import type { RequestHandler, Router } from 'express';
import type { Env } from '../../config/env';
import type { PrismaClient } from '../../generated/prisma/client';
import type { EventBus } from '../../shared/events/event-bus';
import { AuthService } from './application/auth.service';
import { UserService } from './application/user.service';
import type { ProfileVisibility, UserDirectory } from './domain/ports';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { createAuthRouter } from './presentation/auth.routes';
import './presentation/openapi';
import { createRequireAuth } from './presentation/require-auth';
import { createUsersRouter } from './presentation/users.routes';

// Public contract of the Identity module - other modules import only from here.
export type { AuthContext } from './domain/auth-context';
export { USER_REGISTERED, type UserRegisteredEvent } from './domain/events';
export type { ProfileVisibility, UserDirectory, UserSummary } from './domain/ports';
export { requireAuthContext } from './presentation/require-auth';

export type IdentityConfig = Pick<
  Env,
  | 'JWT_ACCESS_SECRET'
  | 'JWT_ACCESS_TTL_SECONDS'
  | 'REFRESH_TOKEN_TTL_DAYS'
  | 'REFRESH_REUSE_GRACE_SECONDS'
  | 'BCRYPT_ROUNDS'
>;

export interface IdentityModule {
  authRouter: Router;
  usersRouter: Router;
  requireAuth: RequestHandler;
  userDirectory: UserDirectory;
}

export function createIdentityModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  profileVisibility: ProfileVisibility;
  config: IdentityConfig;
}): IdentityModule {
  const { prisma, events, profileVisibility, config } = deps;

  const users = new PrismaUserRepository(prisma);
  const accessTokens = new JwtAccessTokenService(
    config.JWT_ACCESS_SECRET,
    config.JWT_ACCESS_TTL_SECONDS,
  );
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
  });
  const requireAuth = createRequireAuth({ accessTokens, users });

  return {
    requireAuth,
    authRouter: createAuthRouter({ auth, requireAuth }),
    usersRouter: createUsersRouter({
      users: new UserService({ users, visibility: profileVisibility }),
      requireAuth,
    }),
    userDirectory: {
      async getSummaries(ids) {
        const summaries = await users.findSummaries(ids);
        return new Map(summaries.map((summary) => [summary.id, summary]));
      },
    },
  };
}
