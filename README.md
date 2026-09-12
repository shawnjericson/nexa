# NEXA Workplace

Private social + communication platform for organizations: company feed, chat, organization &
identity, notifications. It started as a Node.js exam (Social Media API) and grows into the NEXA v1
platform.

- Architecture spec, risk register and exam brief: [`docs/specs/`](docs/specs)
- Architecture decisions: [`docs/adr/`](docs/adr/README.md)

## Stack

| Layer         | Technology                                       |
| ------------- | ------------------------------------------------ |
| Runtime       | Node.js 22, TypeScript                           |
| HTTP          | Express 5                                        |
| Database      | PostgreSQL 18 via Prisma 7 (TLS, pinned cert)    |
| Logs / events | MongoDB 8 (audit + event log, see ADR-009)       |
| Auth          | JWT access tokens (jose) + rotating refresh      |
| Passwords     | bcrypt                                           |
| Validation    | Zod 4                                            |
| API docs      | OpenAPI 3 + Swagger UI                           |
| Logging       | pino (JSON in production, pretty in development) |
| Tests         | Vitest + Supertest against a real PostgreSQL     |

## Repository layout

```
apps/
  api/                    NEXA API (modular monolith)
    prisma/               schema + migrations
    src/
      config/             environment validation
      infrastructure/     database, logger
      modules/
        identity/         register, login, tokens, sessions, profiles
        organization/     organizations, memberships, roles & permissions, org context
        social/           posts, comments, feed
      shared/             errors, HTTP helpers, domain events
      app.ts              composition root + Express pipeline
      server.ts           process entry point
    test/                 integration tests
docs/
  adr/                    architecture decision records
  specs/                  original specification documents
```

Each module follows `domain/ → application/ → infrastructure/ → presentation/` and exposes a
public contract through its `index.ts`. Modules never reach into each other's repositories;
cross-module reactions go through domain events (e.g. `identity.user_registered` → the
Organization module adds the user to the default organization).

## Getting started

Requirements: Node.js 22+, pnpm 10 (`corepack enable`), and a whitelisted IP for the PostgreSQL
server (see ADR-011).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # fill in the real credentials and JWT secret

# Pin the database server certificate (self-signed) for TLS
mkdir -p apps/api/certs
echo | openssl s_client -starttls postgres -connect 139.180.139.17:5432 2>/dev/null \
  | openssl x509 -outform PEM > apps/api/certs/postgres-server.pem

pnpm --filter @nexa/api db:generate      # generate the Prisma client
pnpm --filter @nexa/api db:migrate       # apply migrations
pnpm dev                                 # http://localhost:4000
```

Compare the fingerprint with the server's once, to rule out a man-in-the-middle:

```bash
openssl x509 -in apps/api/certs/postgres-server.pem -noout -fingerprint -sha256
# on the server: openssl x509 -in /etc/ssl/certs/ssl-cert-snakeoil.pem -noout -fingerprint -sha256
```

| URL             | Purpose                       |
| --------------- | ----------------------------- |
| `GET /health`   | Liveness                      |
| `GET /ready`    | Readiness (checks PostgreSQL) |
| `/docs`         | Swagger UI                    |
| `/openapi.json` | OpenAPI document              |
| `/api/v1/*`     | NEXA API                      |
| `/api/*`        | Same endpoints, exam contract |

## Authentication

| Method | Endpoint                       | Auth   | Description                                   |
| ------ | ------------------------------ | ------ | --------------------------------------------- |
| POST   | `/api/v1/auth/register`        | -      | Create an account (joins the default org)     |
| POST   | `/api/v1/auth/login`           | -      | Returns `access_token` + `refresh_token`      |
| POST   | `/api/v1/auth/refresh`         | -      | Rotates the refresh token, returns a new pair |
| POST   | `/api/v1/auth/logout`          | -      | Ends the session of a refresh token           |
| POST   | `/api/v1/auth/change-password` | Bearer | Changes password, signs out other sessions    |
| GET    | `/api/v1/users/me`             | Bearer | Current profile                               |
| PUT    | `/api/v1/users/me`             | Bearer | Update username, display name, avatar, bio    |
| GET    | `/api/v1/users/:id`            | Bearer | Profile of someone sharing an organization    |

- Access tokens are HS256 JWTs valid for 15 minutes and carry only `sub` (user) and `sid`
  (session). Permissions are resolved server-side on every request, never read from the token.
- Refresh tokens are random 256-bit strings valid for 30 days; only their SHA-256 hash is stored.
  Each refresh rotates the token. Replaying a used token revokes the whole session.
- Deactivated accounts lose access immediately, even with an unexpired access token.
- Login answers identically for unknown emails and wrong passwords, and auth endpoints are
  rate-limited.

## Organizations & social

Every social request runs inside one organization. It is taken from the optional
`X-Organization-Id` header, **validated against your membership**. If you belong to a single
organization, that one is used automatically. Suspended or removed members lose access
immediately.

| Method | Endpoint                     | Exam equivalent                   | Who                 |
| ------ | ---------------------------- | --------------------------------- | ------------------- |
| GET    | `/api/v1/feed?cursor&limit`  | `GET /api/posts?page&limit`       | members             |
| POST   | `/api/v1/posts`              | `POST /api/posts`                 | members             |
| GET    | `/api/v1/posts/:id`          | `GET /api/posts/:id`              | members             |
| PUT    | `/api/v1/posts/:id`          | `PUT /api/posts/:id`              | author only         |
| DELETE | `/api/v1/posts/:id`          | `DELETE /api/posts/:id`           | author or moderator |
| GET    | `/api/v1/posts/:id/comments` | `GET /api/comments/post/:postId`  | members             |
| POST   | `/api/v1/posts/:id/comments` | `POST /api/comments/post/:postId` | members             |
| DELETE | `/api/v1/comments/:id`       | `DELETE /api/comments/:id`        | author or moderator |

- Posts and comments of other organizations answer **404**, never 403.
- Deletes are soft. Deleting a comment removes its replies; replies are one level deep.
- `ANNOUNCEMENT` posts need the `announcement.publish` permission. A moderator is anyone with
  `post.moderate`, which OWNER and ADMIN have.
- `/api/v1` lists use cursor pagination (`pagination.next_cursor`); the exam routes use
  `page`/`limit` with totals. See ADR-013.

## Scripts

| Command                     | Description             |
| --------------------------- | ----------------------- |
| `pnpm dev`                  | Run the API with reload |
| `pnpm build` / `pnpm start` | Production build / run  |
| `pnpm test`                 | Run all tests           |
| `pnpm typecheck`            | TypeScript checks       |
| `pnpm lint` / `pnpm format` | ESLint / Prettier       |

Tests run against the database in `TEST_DATABASE_URL`. Its name must end in `_test`, because tests
truncate tables. Migrations are applied to it automatically before the suite starts.

## API response contract

```jsonc
// success
{ "success": true, "data": { } }

// error (satisfies both the exam format and NEXA v1, see ADR-010)
{ "success": false, "status": 404, "error": "Post not found", "code": "POST_NOT_FOUND", "request_id": "req_..." }
```

Status codes: 400 validation, 401 authentication, 403 authorization, 404 not found, 409 conflict,
413 payload too large, 429 rate limit, 500 unexpected, 503 dependency unavailable.
