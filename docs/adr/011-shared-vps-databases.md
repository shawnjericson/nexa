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
- Remote access is locked down twice: UFW opens PostgreSQL (5432), MongoDB (27017) and Redis over
  TLS (6380) only to allowlisted developer addresses, and `pg_hba.conf` only accepts the `nexa`
  role, for `nexa`, `nexa_test` and `nexa_shadow`, from those addresses using `scram-sha-256`.
  `nexa_prod` is not reachable from outside at all.
- Credentials live only in `apps/api/.env` (git-ignored). `.env.example` documents the keys.
- In production the API runs on the same VPS and connects through `127.0.0.1`.

## Consequences

- Each query pays network round-trip latency (~55 ms from Vietnam to the VPS), so the test suite is
  slower than it would be against a local database.
- When a developer's public IP changes, both the UFW rule and the `pg_hba.conf` entry must be updated.
- Developers share one `nexa` database, so destructive experiments belong in `nexa_test`.

## Amendment (2026-09-17)

An audit before publishing the repository found the lockdown above only on paper: `pg_hba.conf`
had a catch-all `host all all 0.0.0.0/0 md5` above the allowlist entry (first match wins, so any
address could try passwords against any database), UFW had the three ports open to everyone, and
the one allowlisted address was stale - the developer's address had changed and could belong to
someone else. The catch-all is gone, the stale address replaced, and UFW now matches this record.
Host and account names no longer appear in `.env.example` or the README.

Home connections get new addresses from time to time. When that happens, the rule in UFW and the
line in `pg_hba.conf` both need the new one; an SSH tunnel to `127.0.0.1` would remove the need
for any database port to be public.
