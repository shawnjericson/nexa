import { jwtVerify, SignJWT } from 'jose';
import { IdentityErrors } from '../domain/identity-errors';
import type { AccountLinkTokens, ExternalProfile } from '../domain/ports';
import { JWT_ISSUER } from './jwt-access-token.service';

// A different audience from access tokens, so neither can be used as the other.
const AUDIENCE = 'nexa-account-link';
const TTL = '10m';

/** Signed, ten-minute proof of a verified provider sign-in, pending the account's password. */
export class JwtAccountLinkTokens implements AccountLinkTokens {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(profile: ExternalProfile): Promise<string> {
    return new SignJWT({
      provider: profile.provider,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(profile.subject)
      .setIssuer(JWT_ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(TTL)
      .sign(this.key);
  }

  async verify(token: string): Promise<ExternalProfile> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: JWT_ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (
        payload.provider !== 'google' ||
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string'
      ) {
        throw new Error('malformed link token');
      }
      return {
        provider: 'google',
        subject: payload.sub,
        email: payload.email,
        emailVerified: true,
        name: typeof payload.name === 'string' ? payload.name : null,
        picture: typeof payload.picture === 'string' ? payload.picture : null,
      };
    } catch {
      throw IdentityErrors.invalidLinkToken();
    }
  }
}
