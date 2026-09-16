import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/features/auth/safe-next-path';
import {
  appUrl,
  callApi,
  clearOauthCookie,
  publicOrigin,
  readOauthCookie,
  setOauthCookie,
  startSessionAndRedirect,
} from '@/lib/server/session';
import { OAUTH_COOKIE, OAUTH_LINK_COOKIE } from '@/lib/session-cookies';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface PendingSignIn {
  state: string;
  verifier: string;
  nonce: string;
  next: string;
}

const failed = (request: NextRequest, code: string) =>
  clearOauthCookie(
    NextResponse.redirect(appUrl(request, `/login?sso_error=${encodeURIComponent(code)}`)),
    OAUTH_COOKIE,
  );

/** Finishes the sign-in: exchanges the code with Google, then hands the ID token to the API. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const pending = readOauthCookie<PendingSignIn>(request, OAUTH_COOKIE);
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  // The state ties this answer to the sign-in this browser started.
  if (!pending || !code || params.get('state') !== pending.state) {
    return failed(request, params.get('error') === 'access_denied' ? 'CANCELLED' : 'INVALID_STATE');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return failed(request, 'SSO_NOT_CONFIGURED');

  let idToken: string | undefined;
  try {
    // The client secret stays on this server; the browser never sees it.
    const exchanged = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${publicOrigin(request)}${request.nextUrl.pathname}`,
        grant_type: 'authorization_code',
        code_verifier: pending.verifier,
      }),
      cache: 'no-store',
    });
    ({ id_token: idToken } = (await exchanged.json()) as { id_token?: string });
  } catch {
    return failed(request, 'PROVIDER_UNREACHABLE');
  }
  if (!idToken) return failed(request, 'INVALID_EXTERNAL_TOKEN');

  const next = safeNextPath(pending.next);
  const signIn = await callApi(
    '/auth/oauth/google',
    { id_token: idToken, nonce: pending.nonce },
    request,
  );
  if (signIn.ok) {
    return clearOauthCookie(
      await startSessionAndRedirect(signIn, appUrl(request, next)),
      OAUTH_COOKIE,
    );
  }

  const body = (await signIn.json().catch(() => null)) as {
    code?: string;
    details?: { link_token?: string; email?: string };
  } | null;
  if (body?.code === 'ACCOUNT_LINK_REQUIRED' && body.details?.link_token) {
    // That email already has an account: ask for its password before connecting Google.
    const result = NextResponse.redirect(
      appUrl(request, `/login?connect=google&next=${encodeURIComponent(next)}`),
    );
    setOauthCookie(result, OAUTH_LINK_COOKIE, {
      token: body.details.link_token,
      email: body.details.email ?? '',
    });
    return clearOauthCookie(result, OAUTH_COOKIE);
  }
  return failed(request, body?.code ?? 'SIGN_IN_FAILED');
}
