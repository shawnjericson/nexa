import { createHash, randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/features/auth/safe-next-path';
import { appUrl, publicOrigin, setOauthCookie } from '@/lib/server/session';
import { OAUTH_COOKIE } from '@/lib/session-cookies';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const random = (bytes: number) => randomBytes(bytes).toString('base64url');

/**
 * Starts a sign-in with Google (ADR-020). The state, the PKCE verifier and the nonce stay in a
 * ten-minute httpOnly cookie, so only this browser can finish this particular sign-in.
 */
export function GET(request: NextRequest): NextResponse {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(appUrl(request, '/login?sso_error=SSO_NOT_CONFIGURED'));
  }

  const pending = {
    state: random(24),
    verifier: random(32),
    nonce: random(24),
    next: safeNextPath(request.nextUrl.searchParams.get('next')),
  };

  const authorize = new URL(AUTHORIZE_ENDPOINT);
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set(
    'redirect_uri',
    `${publicOrigin(request)}${request.nextUrl.pathname}/callback`,
  );
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', pending.state);
  authorize.searchParams.set('nonce', pending.nonce);
  authorize.searchParams.set(
    'code_challenge',
    createHash('sha256').update(pending.verifier).digest('base64url'),
  );
  authorize.searchParams.set('code_challenge_method', 'S256');
  // Let people choose which Google account to use instead of silently reusing one.
  authorize.searchParams.set('prompt', 'select_account');

  return setOauthCookie(NextResponse.redirect(authorize.toString()), OAUTH_COOKIE, pending);
}
