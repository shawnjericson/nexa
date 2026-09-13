import { NextResponse, type NextRequest } from 'next/server';
import {
  callApi,
  endSession,
  forbidden,
  isSameOrigin,
  readRefreshToken,
} from '@/lib/server/session';

/** Ends the session on the API (revoking the refresh token) and clears the cookies. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return forbidden();
  const refreshToken = readRefreshToken(request);
  if (refreshToken) {
    // Signing out locally must work even when the API can't be reached.
    await callApi('/auth/logout', { refresh_token: refreshToken }, request).catch(() => undefined);
  }
  return endSession(NextResponse.json({ success: true, data: { signed_out: true } }));
}
