# ADR-015: Chat, realtime delivery and presence

- Status: Accepted
- Date: 2026-09-12

## Context

Phase 5 adds direct, group and channel chat (spec §9, §10). The risk register sets the hard
requirements:

- no duplicate messages on retry (P0);
- server-defined ordering (9.2);
- reconnect and sync (9.3, 9.4);
- multi-device presence (9.5, 11);
- read state that only moves forward (9.6);
- tombstones for deleted messages (9.7);
- immediate loss of access when removed (P0);
- no admin access to private conversations (P0).

## Decision

1. **One model.** A conversation is `DIRECT`, `GROUP` or `CHANNEL` (spec §9.4). A direct
   conversation is unique per pair of users (`direct_key`); a channel slug is unique per
   organization.
2. **Membership is anchored in the organization.** `conversation_members(organization_id,
user_id)` is a composite foreign key to `organization_members`. Removing someone from the
   organization removes them from every conversation, while their messages stay in the history.
3. **Ordering and idempotency.**
   - Each conversation keeps `last_message_seq`. Sending a message increments it with
     `UPDATE ... RETURNING` in the same transaction as the insert.
   - That row lock yields a gap-free, server-defined `seq`, so client clocks are never trusted.
   - Clients must send a `client_message_id`; `UNIQUE(conversation_id, sender_id,
client_message_id)` plus a lookup under the same lock makes retries return the original
     message (200) instead of creating a duplicate.
4. **Transport.**
   - Messages are created over REST (validated, rate-limited, idempotent). Events are delivered
     over Socket.IO: `message.created/updated/deleted`, `message.read`, `typing.started/stopped`
     and `presence.updated`.
   - Clients reconnect and fetch `GET /conversations/:id/messages?after_seq=` to catch up.
5. **Fan-out to users, not to conversation rooms.** Every socket joins
   `org:{organization}:user:{user}` and `org:{organization}`. An event is sent to the rooms of the
   conversation's _current_ members, looked up at send time. Membership changes therefore apply
   immediately, and there is no room state to keep in sync.
6. **Multiple instances.** The Socket.IO Redis adapter (channel prefix `nexa:socket.io`)
   broadcasts across API instances. Without Redis, a single instance keeps working (risk register
   16).
   - Redis ACL matches `PSUBSCRIBE` patterns literally, so `&nexa:*` is not enough.
   - The `nexa` user also needs `&nexa:socket.io#/#*`, the adapter's pattern for the default
     namespace.
   - Adding a Socket.IO namespace means granting its pattern too.
7. **Presence** is per connection:
   - A Redis sorted set `nexa:presence:{org}:{user}` holds the connection ids, scored by expiry.
   - Heartbeats every 30 s extend a 75 s TTL, so a sleeping laptop expires by itself and a closed
     laptop doesn't mark someone offline while their phone is connected.
   - An in-memory store implements the same port when Redis is not configured.
8. **Read state** is `conversation_members.last_read_seq`, updated only with
   `GREATEST(current, new)`. Unread count is `last_message_seq - last_read_seq`, and sending a
   message marks it read for the sender.
9. **Privacy and moderation.**
   - Only members read or write a DIRECT or GROUP conversation. Organization admins get the same
     404 as anyone else.
   - Channels are public within the organization: any member may browse and join, but reading
     messages requires joining.
   - Messages are edited only by their sender. They can be deleted by the sender, by the
     conversation's OWNER/ADMIN (groups and channels), or, in channels only, by holders of
     `message.moderate`.
   - Deletion keeps a tombstone (`content: null`, `deleted: true`).
10. **History visibility.** New members see the whole history of a group or channel they join.
    Archived channels stay readable but refuse new messages.

## Consequences

- Fan-out reads the member list on every message; cache it in Redis if very large channels appear.
- Typing and presence are ephemeral and never persisted.
- System messages ("X joined") and attachments come in later phases.
