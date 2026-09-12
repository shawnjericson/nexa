# ADR-009: MongoDB only for audit and event logs

- Status: Accepted
- Date: 2026-09-12

## Context

A MongoDB 8.0 instance is available on the VPS. A common assumption is that chat messages belong in
a document store. The MongoDB instance runs **standalone (no replica set)**, so it has no
multi-document transactions.

Chat in NEXA is tightly coupled to relational data: sending a message writes the message, bumps
`conversations.last_message_at` and advances read state, and every read must be authorized against
organization and conversation membership (P0 items in the risk register). Splitting that across two
databases makes those invariants hard to guarantee and doubles backup and user-deletion work.

At NEXA's scale (internal workplace, millions of messages rather than billions), PostgreSQL with an
index on `(conversation_id, created_at, id)` is more than enough.

## Decision

- PostgreSQL remains the single source of truth for all business data, **including chat**.
- MongoDB stores append-only, high-volume, schema-flexible records that need no transactions:
  - audit logs
  - the domain event log (for debugging, replay and future SaaS integrations)
- Events are written to an `outbox` table in the same PostgreSQL transaction as the business change
  and shipped to MongoDB by a worker, so a MongoDB outage never loses events (risk register 12.1).
- Message persistence sits behind a `MessageRepository` so storage can be swapped later if scale
  ever demands it ("design for extraction").

## Consequences

- One transactional store keeps tenant isolation and authorization simple.
- MongoDB can be down without affecting user-facing features, since logs are delayed, not lost.
- Prisma's MongoDB connector requires a replica set, so MongoDB is accessed with the official
  driver / Mongoose instead.
