# ADR-017: Files and object storage

- Status: Accepted
- Date: 2026-09-13

## Context

Spec §12 keeps files outside PostgreSQL, with their metadata inside it, and lets posts and
messages reference them. The risk register (13) sets the cases to handle:

- fake MIME types and executables (P0);
- oversized files;
- storage succeeding while the database fails, and the reverse;
- a file referenced by several records;
- broken download URLs;
- orphans, which must be detectable.

## Decision

1. **Cloudflare R2 through the S3 API.**
   - The code uses `@aws-sdk/client-s3`, so any S3-compatible service (AWS S3, MinIO) works by
     configuration: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` and the keys.
   - R2 charges no egress, which dominates the cost of a feed full of images.
   - The VPS disk is not used. It is shared with the databases, and files on it wouldn't be
     visible to a second API instance.
2. **Direct, two-step uploads.**
   - `POST /api/v1/files` validates the name, the type (allowlist) and the size (25 MB by
     default), then creates a `PENDING` record under a random key `org/{org}/files/{uuid}`.
   - It returns a presigned `PUT` URL, valid 15 minutes, whose signature covers `Content-Type`
     and `Content-Length`. Storage itself refuses any other type or size.
   - The client sends the bytes straight to storage; the API never proxies them.
   - `POST /api/v1/files/:id/complete` checks the stored object:
     - it must exist (otherwise 409 `UPLOAD_INCOMPLETE`);
     - its size must match;
     - its first 4 KB must match the declared type's signature.
   - A mismatch deletes the object and marks the file `FAILED` (422 `FILE_REJECTED`). If storage
     is down the answer is 503, the file stays `PENDING`, and the client retries.
3. **An allowlist, not a blocklist.**
   - Allowed: JPEG, PNG, GIF, WebP, MP4, PDF, DOCX/XLSX/PPTX, ZIP, TXT and CSV. SVG and HTML are
     left out because they can carry scripts.
   - File names lose paths and illegal characters, and their extension is made to agree with the
     type: `invoice.exe` uploaded as a PDF downloads as `invoice.exe.pdf`.
4. **Private bucket, presigned downloads.**
   - Attachments come inside posts and messages with a download URL. Seeing a file means seeing
     the post or conversation that shows it, so organization admins still can't see the files of
     private conversations (ADR-015).
   - URLs are signed as of the start of each hour and valid for two hours. They stay stable for
     browser caches, and every URL handed out works for at least an hour.
   - Images and videos display inline; everything else downloads. The bytes always come from the
     storage domain, never from the API's origin, so an uploaded file can't act with the API's
     origin.
5. **Attachments are references.**
   - `post_attachments` and `message_attachments` rows are written in the same transaction as the
     post or message, after the File module confirmed the files are the author's own `READY`
     uploads in the same organization. Up to 10 files can be attached.
   - Composite foreign keys keep attachments inside the organization. The file side is `NO ACTION`,
     so the database refuses to delete a file that is still referenced (13: multiple references).
   - A soft-deleted post keeps its attachments for moderation. A deleted message loses them, like
     its text, and the files become orphans.
6. **Cleanup job**, every 10 minutes on the server:
   - `PENDING` uploads older than an hour are marked `FAILED` and their object is deleted;
   - `FAILED` records, and `READY` files that nothing references, are purged after 7 days. The
     record is deleted first, and its foreign keys refuse if a reference appeared meanwhile; the
     object is deleted after that.
7. **Abuse limits.** Each person can have 20 unfinished uploads (`FILE_MAX_PENDING_UPLOADS`) and
   start 30 uploads per minute.

## Consequences

- Browser uploads need a CORS rule on the bucket allowing `PUT` from the web app's origin. The API
  token only has object read and write, so the rule is set in the Cloudflare dashboard.
- There are no thumbnails, image resizing or virus scanning yet. A worker can add them between
  `complete` and `READY`.
- There is no per-organization storage quota yet.
- A crash between deleting a record and deleting its object leaks the object; it is logged with its
  key.
- Anyone holding a download URL can use it until it expires, which takes at most two hours.
