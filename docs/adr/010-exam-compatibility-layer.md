# ADR-010: Exam compatibility routes and unified error contract

- Status: Accepted
- Date: 2026-09-12

## Context

NEXA v1 grows out of a Node.js exam (`docs/specs/NodeJS.docx`) whose API contract differs from the
NEXA spec:

| Exam                                                      | NEXA v1 spec                                           |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `/api/auth/*`, `/api/posts`, `/api/comments/post/:postId` | `/api/v1/...`, `/api/v1/posts/:id/comments`            |
| Offset pagination `?page&limit`                           | Cursor pagination                                      |
| Error body `{ "error": "message", "status": 400 }`        | `{ "success": false, "error": { "code", "message" } }` |
| Register has no organization                              | Every post belongs to an organization                  |
| `Post.image_url`                                          | Attachments via the File module                        |

Both contracts must work: the exam is graded against its own contract, while NEXA is the product.

## Decision

1. **`/api/v1/*` is canonical.** A thin `/api/*` router exposes the exam endpoints and calls the same
   application services. No business logic is duplicated.
2. **One error body that satisfies both contracts:**

   ```json
   {
     "success": false,
     "status": 404,
     "error": "Post not found",
     "code": "POST_NOT_FOUND",
     "details": [],
     "request_id": "req_..."
   }
   ```

   `error` stays a human-readable string (exam), and `code` / `request_id` carry the NEXA
   information. This replaces the nested `error` object from spec §16.7.

3. **Organization context without extra headers:** registering without an invitation joins the
   default organization (`DEFAULT_ORG_SLUG`) as `MEMBER`. The active organization comes from the
   optional `X-Organization-Id` header, **validated against membership**, falling back to the user's
   default membership. The client never gets to choose an organization it does not belong to.
4. Feed: the legacy route uses offset pagination, `/api/v1/feed` uses cursor pagination, and both go
   through the same query service.
5. `posts.image_url` is kept as a nullable column; attachments arrive with the File module.

## Consequences

- The exam's Postman collection works unchanged, and NEXA clients use `/api/v1`.
- The legacy router can be removed later without touching the domain.
