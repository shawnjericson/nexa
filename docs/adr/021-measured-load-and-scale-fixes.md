# ADR-021: Load-tested at 20,000 people, and what that changed

- Status: Accepted
- Date: 2026-09-17

## Context

The public demo adds a member for every visitor, and a real company keeps years of messages and
notifications. Reading the schema suggested the hot paths were indexed; nothing had checked what
the application actually does with a large organization. [performance.md](../performance.md) has
the method, the numbers and the charts.

## Decision

1. **Load tests are part of the repository.** `load/` builds a 20,000-person organization inside
   PostgreSQL and runs k6 scenarios against a separate API on the production server; changes to hot
   paths are measured before and after.
2. **No work proportional to the whole table in a request.** Relation counts are computed for the
   rows on the page (never Prisma's filtered `_count`, which aggregates the entire related table),
   member lists are searched, filtered and sorted by the API one page at a time, and "N online" is
   a counter rather than a lookup per member.
3. **No work proportional to the audience inside a request.** Channel messages no longer create a
   notification per member - channels show unread counts. Notifications for direct and group
   conversations are coalesced for all recipients in two statements, with every advisory lock taken
   in one sorted statement.
4. **CPU-heavy work stays off the event loop.** Passwords are hashed with native bcrypt on the libuv
   thread pool (same format and cost); accounts that never sign in with a password store none.

## Consequences

- With 20,000 people nothing fails any more, sending to any channel takes milliseconds, and the
  API serves ten times as many requests before saturating.
- The bell no longer rings for channel activity; people who want to hear about a channel will need
  mentions or per-channel notification settings, which don't exist yet.
- The ceiling is now CPU on one Node process at about 50 requests a second. Two processes (with
  the rate limiter's counters in Redis) and a cache for the per-request membership lookup are the
  next steps, to be measured the same way.
