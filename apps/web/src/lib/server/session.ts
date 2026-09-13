import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE, SESSION_COOKIE_PATH, SESSION_HINT_COOKIE } from '@/lib/session-cookies';

/** Where the Next.js server reaches the API. */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Matches REFRESH_TOKEN_TTL_DAYS of the API; the API decides whether a token is still valid.
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const secure = process.env.NODE_ENV === 'production';

interface Tokens {
  access_token: string;
  expires_in: number;
  refresh_token: string;
}

/** Session routes only answer same-origin requests (no cross-site login/logout). */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return origin === null || origin === request.nextUrl.origin;
}

export function forbidden(): NextResponse {
  return NextResponse.json(
    { success: false, status: 403, error: 'Cross-site request refused', code: 'FORBIDDEN' },
    { status: 403 },
  );
}

/** POSTs to /api/v1{path}, passing the client's user agent and address along. */
export function callApi(path: string, body: unknown, request: NextRequest): Promise<Response> {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('user-agent') ?? 'nexa-web',
      ...(forwardedFor && { 'X-Forwarded-For': forwardedFor }),
    },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });
}

/** Relays an API error body and status unchanged (the unified error contract, ADR-010). */
export async function relayError(response: Response): Promise<NextResponse> {
  const body: unknown = await response.json().catch(() => ({
    success: false,
    status: response.status,
    error: 'The API is unavailable',
    code: 'API_UNAVAILABLE',
  }));
  return NextResponse.json(body, { status: response.status });
}

/**
 * Turns an API token response into the browser's session: the refresh token goes into the
 * httpOnly cookie, and only the short-lived access token reaches page scripts.
 */
export async function startSession(response: Response): Promise<NextResponse> {
  if (!response.ok) return relayError(response);
  const { data } = (await response.json()) as { data: Tokens };
  const result = NextResponse.json({
    success: true,
    data: { access_token: data.access_token, expires_in: data.expires_in },
  });
  result.cookies.set(REFRESH_COOKIE, data.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: SESSION_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
  result.cookies.set(SESSION_HINT_COOKIE, '1', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
  return result;
}

export function endSession(result: NextResponse): NextResponse {
  result.cookies.set(REFRESH_COOKIE, '', { path: SESSION_COOKIE_PATH, maxAge: 0 });
  result.cookies.set(SESSION_HINT_COOKIE, '', { path: '/', maxAge: 0 });
  return result;
}

export function readRefreshToken(request: NextRequest): string | undefined {
  return request.cookies.get(REFRESH_COOKIE)?.value;
}
