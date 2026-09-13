import type { NextRequest } from 'next/server';
import { callApi, forbidden, isSameOrigin, startSession } from '@/lib/server/session';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return forbidden();
  const body: unknown = await request.json().catch(() => ({}));
  return startSession(await callApi('/auth/login', body, request));
}
