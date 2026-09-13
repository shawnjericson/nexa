import { createApiClient } from '@nexa/api-client';
import { currentAccessToken, refreshAccessToken, sessionExpired } from '@/lib/auth/session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let activeOrganizationId: string | null = null;

/** Every request runs inside this organization (X-Organization-Id, validated by the API). */
export function setActiveOrganizationId(id: string | null): void {
  activeOrganizationId = id;
}

export function getActiveOrganizationId(): string | null {
  return activeOrganizationId;
}

function authorize(request: Request, token: string | null): Request {
  const headers = new Headers(request.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (activeOrganizationId && !headers.has('X-Organization-Id')) {
    headers.set('X-Organization-Id', activeOrganizationId);
  }
  return new Request(request, { headers });
}

/** Adds the access token, and renews it once when the API answers 401. */
async function authorizedFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const token = currentAccessToken() ?? (await refreshAccessToken());
  const response = await fetch(authorize(request, token));
  if (response.status !== 401) return response;

  const renewed = await refreshAccessToken();
  if (!renewed) {
    sessionExpired();
    return response;
  }
  return fetch(authorize(retry, renewed));
}

export const api = createApiClient({ baseUrl: API_URL, fetch: authorizedFetch });
