import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { IdentityErrors } from '../domain/identity-errors';
import type { ExternalIdentityVerifier, ExternalProfile } from '../domain/ports';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_KEYS = new URL('https://www.googleapis.com/oauth2/v3/certs');

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Verifies Google ID tokens (OpenID Connect): the signature against Google's published keys,
 * the issuer, the audience (our client ID), the expiry and the nonce of the sign-in request.
 */
export class GoogleIdTokenVerifier implements ExternalIdentityVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(
    private readonly clientId: string,
    keys?: JWTVerifyGetKey,
  ) {
    // jose caches the key set and fetches it again when Google rotates its keys.
    this.keys = keys ?? createRemoteJWKSet(GOOGLE_KEYS);
  }

  async verify(idToken: string, nonce: string): Promise<ExternalProfile> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.keys, {
        issuer: GOOGLE_ISSUERS,
        audience: this.clientId,
        algorithms: ['RS256'],
      }));
    } catch {
      throw IdentityErrors.invalidExternalToken();
    }
    // The nonce ties the token to the sign-in this browser started, so a token captured
    // elsewhere can't be replayed here.
    if (typeof payload.sub !== 'string' || payload.nonce !== nonce) {
      throw IdentityErrors.invalidExternalToken();
    }
    const email = text(payload.email, 254);
    if (!email) throw IdentityErrors.invalidExternalToken();

    const picture = text(payload.picture, 2048);
    return {
      provider: 'google',
      subject: payload.sub,
      email: email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: text(payload.name, 100),
      picture: picture?.startsWith('https://') ? picture : null,
    };
  }
}
