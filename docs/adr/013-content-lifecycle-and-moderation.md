# ADR-013: Content lifecycle, moderation and feed pagination

- Status: Accepted
- Date: 2026-09-12

## Context

Posts and comments are the core of the exam and of the NEXA feed. The risk register asks for
explicit decisions on concurrent update/delete (7.1), deleting posts that have comments (7.3),
nested comments (7.4), ownership vs. moderation (5.5), and feed pagination stability (8.1 to 8.3).

## Decision

1. **Organization context on every request.** `requireOrganization` resolves the active
   organization from the caller's membership: the `X-Organization-Id` header is validated against
   it, and when absent the only membership is used. Several memberships without a header answer 400. Unknown or foreign organizations answer 403 `NOT_A_MEMBER`, and suspended members get 403.
   Handlers take `organization_id` only from this context, never from the request body.
2. **Tenant isolation in every query.** Repositories filter by `organization_id`. Resources of
   another organization answer **404**, never 403. `comments(post_id, organization_id)` is a
   composite foreign key to `posts(id, organization_id)`.
3. **Soft delete.** Deleting a post or comment sets `deleted_at`. Deleted posts disappear from
   reads and the feed, and their comments become unreachable. Deleting a comment also deletes its
   replies, so threads never dangle.
4. **Authorization.** Only the author edits a post; a moderator may remove content but never
   rewrite it. Posts and comments can be deleted by their author or by a holder of
   `post.moderate`. Announcements require `announcement.publish`. Other members get 403.
   Responses carry `can_edit` / `can_delete` hints for a permission-aware UI; the server stays
   authoritative.
5. **Concurrency.** Authorization is checked at mutation time, and writes are conditional on
   `deleted_at IS NULL`. If a post is deleted between check and write, deletion wins and the
   update answers 404. Otherwise edits are last-write-wins.
6. **Replies are one level deep.** A reply to a reply is attached to the thread root, which keeps
   nesting bounded while preserving `parent_id`.
7. **Pagination.** `/api/v1/feed` and comment lists use keyset pagination on `(created_at, id)`
   with an opaque base64url cursor, so new or deleted items never shift or duplicate later pages.
   The exam routes (`/api/posts`, `/api/comments/post/:postId`) use page/limit with totals, backed
   by the same services.
8. **Plain text.** Content is stored and returned as plain text; clients render it escaped.

## Consequences

- Moderation is auditable because nothing is hard-deleted; a purge/retention job can come later.
- Department/channel visibility and reactions extend the same model without changing these rules.
