/**
 * Session cookies (ADR-019). The refresh token lives in an httpOnly cookie scoped to the session
 * routes, so page scripts can never read it. The hint cookie only tells routing whether someone
 * appears to be signed in; the API remains the only authority.
 */
export const REFRESH_COOKIE = 'nexa_refresh';
export const SESSION_HINT_COOKIE = 'nexa_session';
export const LOCALE_COOKIE = 'nexa_locale';
export const SESSION_COOKIE_PATH = '/api/session';

/** Short-lived cookies of a sign-in with an identity provider (ADR-020). */
export const OAUTH_COOKIE = 'nexa_oauth';
export const OAUTH_LINK_COOKIE = 'nexa_oauth_link';
export const OAUTH_COOKIE_PATH = '/api/session/oauth';
