import type { Request, RequestHandler } from 'express';
import type { AuthContext } from '../domain/auth-context';
import { IdentityErrors } from '../domain/identity-errors';
import type { AccessTokenService, UserRepository } from '../domain/ports';

const BEARER = /^Bearer\s+(\S+)$/i;

export type Authenticate = (token: string) => Promise<AuthContext>;

/**
 * Verifies an access token, for HTTP requests and WebSocket handshakes alike. A valid signature
 * is not enough: deactivated accounts lose access immediately instead of when the token expires
 * (risk register 4.3).
 */
export function createAuthenticator(deps: {
  accessTokens: AccessTokenService;
  users: UserRepository;
}): Authenticate {
  return async (token) => {
    const auth = await deps.accessTokens.verify(token);
    const user = await deps.users.findById(auth.userId);
    if (!user || user.status !== 'ACTIVE') throw IdentityErrors.invalidToken();
    return auth;
  };
}

export function createRequireAuth(authenticate: Authenticate): RequestHandler {
  return async (req, _res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw IdentityErrors.missingToken();
    req.auth = await authenticate(token);
    next();
  };
}

export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) throw IdentityErrors.missingToken();
  return req.auth;
}
