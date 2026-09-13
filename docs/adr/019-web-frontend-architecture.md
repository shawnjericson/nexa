# ADR-019: Web frontend architecture

- Status: Accepted
- Date: 2026-09-13

## Context

The Frontend & Design System Specification asks for a React/Next.js + TypeScript workspace with
four things:

- a typed API client;
- a query cache for server state;
- a small store for UI state;
- a dedicated realtime module.

It also sets a visual language through tokens (§4), and it defines how the frontend must behave on
sign-out, organization switches and with two tabs open (§17-18).

The API is a separate Express service. It authenticates with short-lived JWT access tokens and
rotating refresh tokens (ADR-004), and it scopes every request to an organization with
`X-Organization-Id` (ADR-013).

## Decision

1. **Next.js 16 App Router, client-rendered workspace.**
   - The workspace is behind sign-in and is realtime-heavy, so its pages render on the client with
     TanStack Query.
   - Server components only produce the document itself: `<html lang>`, the font, metadata and
     titles in the visitor's language.
   - `proxy.ts` redirects between the sign-in pages and the workspace, based on a hint cookie. The
     API remains the only authority.
2. **Session through the Next.js server.**
   - The `/api/session/{login,register,refresh,logout}` route handlers call the API.
   - They keep the refresh token in an `httpOnly`, `SameSite=Lax` cookie scoped to
     `/api/session`, so page scripts never see it. Only the 15-minute access token reaches the
     browser, and it is held in memory only, never in `localStorage`.
   - The session routes refuse cross-origin requests.
   - Refreshes are serialized across tabs with the Web Locks API, and a new token is shared with
     BroadcastChannel. Two tabs therefore never race the refresh-token rotation, and signing out in
     one tab signs out all of them.
   - A 401 triggers one refresh and one retry. Network failures surface as "cannot reach NEXA"
     instead of signing the person out.
3. **The contract comes from the API itself.**
   - `packages/api-client` generates its types from the API's OpenAPI document (the same Zod schemas
     the API validates with), and uses `openapi-fetch`.
   - A contract change shows up as a type error in the web build (`pnpm api-client:generate`).
4. **Tenancy in the cache.**
   - Every organization-scoped query key starts with `['org', organizationId]`.
   - Switching organization removes those queries and updates the header before the next request.
   - Signing out clears the whole cache. Nothing from one company can render inside another (§17).
5. **Bilingual, Vietnamese first.**
   - Messages live in typed dictionaries: Vietnamese is the reference, and English must have the
     same keys and placeholders (a unit test checks both).
   - The locale lives in a cookie so the server can render `lang` and titles.
   - Dates, times and relative times use `Intl`. No i18n library is needed at this size.
6. **Design tokens, not raw colors.**
   - The spec's light and dark tokens and the brand colors (primary `#087F6C`) are CSS variables,
     mapped into Tailwind 4 theme names (`bg-surface`, `text-muted`, `bg-accent`...).
   - Dark mode follows the system through `next-themes`, and people can override it.
   - The typeface is Inter with the Vietnamese subset.
7. **Components.**
   - Accessible behavior comes from Radix primitives (menus, dialogs, tooltips), with Lucide icons,
     `cmdk` for the command palette and `sonner` for toasts.
   - Primitives live in `apps/web/src/components/ui` and are domain-agnostic. Domain code lives in
     `src/features/*`.
   - The spec's separate `packages/ui`, `packages/realtime` and `packages/types` are deferred until
     a second frontend needs them; the typed API client is already a package.

## Consequences

- The Next.js server must reach the API (`API_URL`). The API sees sign-in requests coming from the
  Next.js server, so in production `TRUST_PROXY` must be set for rate limits to use the forwarded
  client address.
- Pages are not server-rendered with data. That is fine for an internal, signed-in product, and it
  keeps tenant data out of any server-side cache.
- Adding a language means adding one dictionary, and TypeScript lists every missing key.
