# ADR-016: Notifications and the audit log

- Status: Accepted
- Date: 2026-09-13

## Context

Phase 6 adds in-app notifications (spec §11.1, §16.6) and the audit log that ADR-009 reserved
MongoDB for. The risk register sets the requirements:

- a notification never fails the action that caused it (12.1);
- an event delivered twice is applied once (12.2);
- bursts are grouped instead of flooding the list (12.3);
- notifications caused by people who have since left still render (12.4);
- MongoDB being down must neither fail requests nor lose audit entries (21).

## Decision

1. **Notifications are a pure consumer.** Producers publish domain events and know nothing about
   notifications. `notification-rules.ts` is the one place that maps events to recipients:

   | Event                                  | Recipients                                            | Grouped per    |
   | -------------------------------------- | ----------------------------------------------------- | -------------- |
   | `social.comment_created`               | post author; the author of the comment replied to     | post / comment |
   | `social.post_reacted`                  | post author, for new reactions (not for changing one) | post           |
   | `social.post_created` (`ANNOUNCEMENT`) | every active member                                   | not grouped    |
   | `communication.message_created`        | the other members of the conversation                 | conversation   |
   | `organization.member_updated` (role)   | the member                                            | not grouped    |

   Nobody is notified about their own action.

2. **Coalescing.**
   - A notification with a `group_key` is merged into the recipient's _unread_ notification with
     the same key. `count` increments, `updated_at` moves, and `metadata.actor_ids` keeps the three
     most recent distinct actors. Once it is read, the next event starts a new notification.
   - A transaction-scoped advisory lock on `(recipient, group_key)` serializes concurrent merges, so
     a burst can't split into two rows.
   - Reading doesn't touch `updated_at`, so the list stays ordered by last activity.
3. **Idempotent consumer.** A receipt in `processed_events(consumer, event_id)` is written in the
   same transaction as the notifications. A redelivered event finds its receipt and changes
   nothing. This is what will make an at-least-once outbox worker safe.
4. **Storage and delivery.**
   - Notifications live in PostgreSQL: they are per-organization business data with read state.
   - New and coalesced notifications are pushed as `notification.created` to
     `org:{org}:user:{user}`, and clients upsert by id.
   - Actors are resolved through the user directory when notifications are read, so a deactivated
     actor doesn't break the item.
5. **Audit log in MongoDB.**
   - Administrative and moderation events (`audited-events.ts`) are stored in `audit_logs` with
     `_id` set to the event id, so a duplicate insert is ignored.
   - Indexes: `(organization_id, occurred_at desc, _id desc)` and
     `(organization_id, action, occurred_at desc)`.
   - `GET /api/v1/audit-logs` requires `audit.read` (OWNER, ADMIN), is scoped to the active
     organization, and pages by `(occurred_at, id)`.
6. **Outage fallback.**
   - If the MongoDB write fails, the entry is kept in `pending_audit_events` in PostgreSQL (upsert
     by event id), and the server retries every 30 s.
   - MongoDB is not a readiness dependency: an outage delays the audit log, it doesn't take the
     API down.
   - Without `MONGODB_URI` the audit log is disabled and the endpoint answers 503
     `AUDIT_UNAVAILABLE`.
7. **Moderation is explicit.** `social.post_deleted`, `social.comment_deleted` and
   `communication.message_deleted` carry `moderated: true` when someone other than the author
   deleted the content, which is what auditors look for.

## Consequences

- Events are still published in-process after the commit, so a crash between the commit and the
  publish loses the notification and the audit entry. The transactional outbox (ADR-009) closes that
  gap, and the idempotent receipts are already in place for it.
- Announcements write one row per member; very large organizations will need a background worker.
- `processed_events` grows with every consumed event. Prune it past the outbox retry window once
  the outbox exists.
- Email and push delivery, and per-user notification preferences, come later.
