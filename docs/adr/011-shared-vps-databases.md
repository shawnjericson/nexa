# ADR-011: Development uses the shared databases on the VPS

- Status: Accepted
- Date: 2026-09-12

## Context

The team runs a VPS (managed with FlashPanel) that already hosts PostgreSQL 18 and MongoDB 8.0. The
product owner prefers a shared online environment over per-developer Docker databases.

## Decision

- PostgreSQL databases on the VPS, all owned by the `nexa` role:
  - `nexa`: development / demo data
  - `nexa_test`: automated tests (truncated freely)
  - `nexa_shadow`: Prisma's shadow database for `migrate dev`
- Remote access is locked down twice: UFW allows ports 5432/27017 only from whitelisted developer
  IPs, and `pg_hba.conf` only accepts the `nexa` role from those IPs using `scram-sha-256`.
- Credentials live only in `apps/api/.env` (git-ignored). `.env.example` documents the keys.
- In production the API runs on the same VPS and connects through `127.0.0.1`.

## Consequences

- Each query pays network round-trip latency (~55 ms from Vietnam to the VPS), so the test suite is
  slower than it would be against a local database.
- When a developer's public IP changes, both the UFW rule and the `pg_hba.conf` entry must be updated.
- Developers share one `nexa` database, so destructive experiments belong in `nexa_test`.
