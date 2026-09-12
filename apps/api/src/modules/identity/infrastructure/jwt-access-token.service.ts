import { errors, jwtVerify, SignJWT } from 'jose';
import { AppError } from '../../../shared/errors/app-error';
import type { AuthContext } from '../domain/auth-context';
import { IdentityErrors } from '../domain/identity-errors';
import type { AccessTokenService } from '../domain/ports';

export const JWT_ISSUER = 'nexa';
export const JWT_AUDIENCE = 'nexa-api';

/**
 * Short-lived HS256 access tokens carrying only identity (sub) and session (sid).
 * Permissions are deliberately NOT embedded: they are resolved server-side on every
 * request, so role changes take effect immediately (risk register 4.4).
 */
export class JwtAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue({ userId, sessionId }: AuthContext): Promise<{ token: string; expiresIn: number }> {
    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
    return { token, expiresIn: this.ttlSeconds };
  }

  async verify(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw IdentityErrors.invalidToken();
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof errors.JWTExpired) throw IdentityErrors.tokenExpired();
      throw IdentityErrors.invalidToken();
    }
  }
}
