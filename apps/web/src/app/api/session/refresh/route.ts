import { NextResponse, type NextRequest } from 'next/server';
import {
  callApi,
  endSession,
  forbidden,
  isSameOrigin,
  readRefreshToken,
  relayError,
  startSession,
} from '@/lib/server/session';

/** Exchanges the refresh cookie for a new access token, rotating the cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return forbidden();
  const refreshToken = readRefreshToken(request);
  if (!refreshToken) {
    return endSession(
      NextResponse.json(
        { success: false, status: 401, error: 'Not signed in', code: 'NO_SESSION' },
        { status: 401 },
      ),
    );
  }

  const response = await callApi('/auth/refresh', { refresh_token: refreshToken }, request);
  if (response.ok) return startSession(response);
  const error = await relayError(response);
  // A rejected token is useless; an unreachable API is not a reason to sign out.
  return response.status === 401 ? endSession(error) : error;
}
