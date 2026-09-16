import { ApiError } from '@nexa/api-client';

/**
 * The browser side of the session (ADR-019).
 * - The access token lives in memory only (never localStorage) and is short-lived.
 * - The refresh token stays in an httpOnly cookie handled by the /api/session routes.
 * - Tabs refresh one at a time (Web Locks) and share new tokens (BroadcastChannel), so two tabs
 *   never race the refresh token rotation (spec §18: two tabs).
 */

interface AccessToken {
  value: string;
  expiresAt: number;
}

type SessionMessage = { type: 'token'; token: AccessToken } | { type: 'signed-out' };
type Listener = (signedIn: boolean) => void;

/** Tokens this close to expiry are renewed before use. */
const EXPIRY_MARGIN_MS = 30_000;

let current: AccessToken | null = null;
let inflight: Promise<string | null> | null = null;
const listeners = new Set<Listener>();

const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('nexa-session')
    : null;

channel?.addEventListener('message', (event: MessageEvent<SessionMessage>) => {
  if (event.data.type === 'token') {
    current = event.data.token;
  } else {
    current = null;
    emit(false);
  }
});

function emit(signedIn: boolean) {
  for (const listener of listeners) listener(signedIn);
}

function freshToken(): string | null {
  return current && current.expiresAt - Date.now() > EXPIRY_MARGIN_MS ? current.value : null;
}

function accept(data: { access_token: string; expires_in: number }): string {
  current = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  channel?.postMessage({ type: 'token', token: current } satisfies SessionMessage);
  return current.value;
}

function withLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('nexa-session-refresh', work);
  }
  return work();
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`/api/session/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readTokens(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw ApiError.fromBody(body, response.status);
  return accept((body as { data: { access_token: string; expires_in: number } }).data);
}

/** The current access token, if it is still fresh. */
export function currentAccessToken(): string | null {
  return freshToken();
}

/**
 * A fresh access token from the session cookie, or null when there is no session. Throws when
 * the server can't be reached, so being offline is never mistaken for being signed out.
 */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= withLock(async () => {
    // Another tab may have refreshed while this one waited for the lock.
    const shared = freshToken();
    if (shared) return shared;
    try {
      return await readTokens(await post('refresh'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        current = null;
        return null;
      }
      throw error;
    }
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function signIn(credentials: { email: string; password: string }): Promise<void> {
  await readTokens(await post('login', credentials));
  emit(true);
}

export async function signUp(input: {
  email: string;
  username: string;
  display_name: string;
  password: string;
}): Promise<void> {
  await readTokens(await post('register', input));
  emit(true);
}

/**
 * The account a sign-in with a provider is waiting to be connected to, or null when there is
 * none (the request expired, or the page was opened directly). See ADR-020.
 */
export async function pendingAccountLink(): Promise<{ provider: string; email: string } | null> {
  const response = await fetch('/api/session/oauth/link', { credentials: 'same-origin' });
  if (!response.ok) return null;
  const body = (await response.json()) as { data: { provider: string; email: string } };
  return body.data;
}

/** Confirms the existing account's password, which connects the provider and signs in. */
export async function completeAccountLink(password: string): Promise<void> {
  await readTokens(await post('oauth/link', { password }));
  emit(true);
}

export async function signOut(): Promise<void> {
  await post('logout').catch(() => undefined);
  current = null;
  channel?.postMessage({ type: 'signed-out' } satisfies SessionMessage);
  emit(false);
}

/** Called when the API rejects the session, e.g. after a password change on another device. */
export function sessionExpired(): void {
  current = null;
  emit(false);
}

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
