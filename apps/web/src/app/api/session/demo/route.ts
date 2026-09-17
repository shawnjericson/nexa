import { NextResponse, type NextRequest } from 'next/server';
import {
  appUrl,
  callApi,
  forbidden,
  isSameOrigin,
  startSessionAndRedirect,
} from '@/lib/server/session';

/**
 * "Try the demo" on the landing page. A plain form POST, so the button works before any
 * JavaScript has loaded - and never a GET, because link previewers and crawlers follow links and
 * every call creates an account.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return forbidden();
  const response = await callApi('/auth/demo', {}, request);
  if (!response.ok) {
    const reason = response.status === 429 ? 'busy' : 'unavailable';
    return NextResponse.redirect(appUrl(request, `/?demo=${reason}`), 303);
  }
  return startSessionAndRedirect(response, appUrl(request, '/home'), 303);
}
