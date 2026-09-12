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
| Database      | PostgreSQL 18 via Prisma 7                       |
| Logs / events | MongoDB 8 (audit + event log, see ADR-009)       |
| Validation    | Zod 4                                            |
| API docs      | OpenAPI 3 + Swagger UI                           |
| Logging       | pino (JSON in production, pretty in development) |
| Tests         | Vitest + Supertest                               |

## Repository layout

```
apps/
  api/                 NEXA API (modular monolith)
    prisma/            schema + migrations
    src/
      config/          environment validation
      infrastructure/  database, logger, (redis, storage, websocket later)
      modules/         identity, organization, social, communication, ...
      shared/          errors, HTTP helpers, events, utils
      app.ts           Express app factory
      server.ts        process entry point
    test/
docs/
  adr/                 architecture decision records
  specs/               original specification documents
```

## Getting started

Requirements: Node.js 22+, pnpm 10 (`corepack enable`), and access to the PostgreSQL database
(see ADR-011).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then fill in the real credentials
pnpm --filter @nexa/api db:generate      # generate the Prisma client
pnpm --filter @nexa/api db:migrate       # apply migrations
pnpm dev                                 # http://localhost:4000
```

| URL             | Purpose                       |
| --------------- | ----------------------------- |
| `GET /health`   | Liveness                      |
| `GET /ready`    | Readiness (checks PostgreSQL) |
| `/docs`         | Swagger UI                    |
| `/openapi.json` | OpenAPI document              |
| `/api/v1/*`     | NEXA API                      |

## Scripts

| Command                     | Description             |
| --------------------------- | ----------------------- |
| `pnpm dev`                  | Run the API with reload |
| `pnpm build` / `pnpm start` | Production build / run  |
| `pnpm test`                 | Run all tests           |
| `pnpm typecheck`            | TypeScript checks       |
| `pnpm lint` / `pnpm format` | ESLint / Prettier       |

## API response contract

```jsonc
// success
{ "success": true, "data": { } }

// error (satisfies both the exam format and NEXA v1, see ADR-010)
{ "success": false, "status": 404, "error": "Post not found", "code": "POST_NOT_FOUND", "request_id": "req_..." }
```

Status codes: 400 validation, 401 authentication, 403 authorization, 404 not found, 409 conflict,
413 payload too large, 429 rate limit, 500 unexpected, 503 dependency unavailable.
