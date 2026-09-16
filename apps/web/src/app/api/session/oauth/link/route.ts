import { NextResponse, type NextRequest } from 'next/server';
import {
  callApi,
  clearOauthCookie,
  forbidden,
  isSameOrigin,
  readOauthCookie,
  relayError,
  startSession,
} from '@/lib/server/session';
import { OAUTH_LINK_COOKIE } from '@/lib/session-cookies';

interface PendingLink {
  token: string;
  email: string;
}

const expired = () =>
  NextResponse.json(
    {
      success: false,
      status: 401,
      error: 'The connection request has expired',
      code: 'INVALID_LINK_TOKEN',
    },
    { status: 401 },
  );

/** Which account is waiting to be connected. The link token itself never leaves this server. */
export function GET(request: NextRequest): NextResponse {
  const pending = readOauthCookie<PendingLink>(request, OAUTH_LINK_COOKIE);
  if (!pending) {
    return NextResponse.json(
      { success: false, status: 404, error: 'No pending connection', code: 'NO_PENDING_LINK' },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: { provider: 'google', email: pending.email } });
}

/** Connects the provider to the existing account once its password is confirmed. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return forbidden();
  const pending = readOauthCookie<PendingLink>(request, OAUTH_LINK_COOKIE);
  if (!pending) return expired();

  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const response = await callApi(
    '/auth/oauth/link',
    { link_token: pending.token, password: body.password },
    request,
  );
  if (!response.ok) return relayError(response);
  return clearOauthCookie(await startSession(response), OAUTH_LINK_COOKIE);
}
