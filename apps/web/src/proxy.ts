import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_HINT_COOKIE } from '@/lib/session-cookies';

const PUBLIC_PATHS = ['/login', '/register'];

/**
 * Routing only: sends visitors without a session to sign in and signed-in people away from the
 * sign-in pages. Authorization itself is always enforced by the API.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_HINT_COOKIE);
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!signedIn && !isPublic) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (signedIn && isPublic) return NextResponse.redirect(new URL('/home', request.url));
  return NextResponse.next();
}

export const config = {
  // Pages only: not the session API, Next.js assets or files such as icon.svg.
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
};
