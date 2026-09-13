import type { NextRequest } from 'next/server';
import { callApi, forbidden, isSameOrigin, relayError, startSession } from '@/lib/server/session';

/** Creates the account, then signs straight in with the same credentials. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return forbidden();
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };

  const registered = await callApi('/auth/register', body, request);
  if (!registered.ok) return relayError(registered);
  return startSession(
    await callApi('/auth/login', { email: body.email, password: body.password }, request),
  );
}
