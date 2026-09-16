import { z } from 'zod';
import '../../../shared/http/openapi';
import { ALLOWED_MIME_TYPES } from '../domain/file-types';

/** Files per post or message. */
export const MAX_ATTACHMENTS = 10;

const FileKindEnum = z.enum(['image', 'video', 'document', 'archive']);

// ─── Requests ──────────────────────────────────────────────────────────────

export const CreateUploadBody = z
  .object({
    filename: z.string().trim().min(1).max(255).openapi({ example: 'Báo cáo Q3.pdf' }),
    content_type: z.enum(ALLOWED_MIME_TYPES).openapi({
      description: 'Checked against the actual bytes when the upload completes',
      example: 'application/pdf',
    }),
    size: z.number().int().min(1).openapi({
      description: 'Exact size in bytes. The upload URL only accepts a body of this size.',
      example: 482133,
    }),
  })
  .openapi('CreateUploadRequest');

export const FileParams = z.object({ id: z.uuid() });

export const SetAvatarBody = z
  .object({
    file_id: z.uuid().openapi({
      description: 'One of your READY uploads: a JPEG, PNG, GIF or WebP picture of at most 5 MB',
    }),
  })
  .openapi('SetAvatarRequest');

export type SetAvatarInput = z.infer<typeof SetAvatarBody>;

export const AvatarResponse = z
  .object({
    avatar_url: z.string().nullable().openapi({
      description: 'Serves the picture to anyone (for <img> tags) while it is your avatar',
    }),
  })
  .openapi('AvatarResponse');

/** Attachment ids in post and message requests. */
export const AttachmentIds = z
  .array(z.uuid())
  .max(MAX_ATTACHMENTS)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'A file can be attached only once',
  })
  .openapi({
    description: `Up to ${MAX_ATTACHMENTS} of your own uploaded files with status READY, in display order`,
  });

// ─── Responses ─────────────────────────────────────────────────────────────

export const AttachmentResponse = z
  .object({
    id: z.uuid(),
    filename: z.string(),
    content_type: z.string(),
    kind: FileKindEnum,
    size: z.number().int(),
    url: z.string().openapi({
      description:
        'Presigned download URL, valid for at least an hour; fetch the item again for a new one',
    }),
    url_expires_at: z.iso.datetime(),
  })
  .openapi('Attachment');

export const FileResponse = z
  .object({
    id: z.uuid(),
    filename: z.string(),
    content_type: z.string(),
    kind: FileKindEnum,
    size: z.number().int(),
    status: z.enum(['PENDING', 'READY', 'FAILED']),
    failure_reason: z.string().nullable(),
    url: z.string().nullable().openapi({ description: 'Download URL once the file is READY' }),
    url_expires_at: z.iso.datetime().nullable(),
    created_at: z.iso.datetime(),
    uploaded_at: z.iso.datetime().nullable(),
  })
  .openapi('File');

export const CreateUploadResponse = z
  .object({
    file: FileResponse,
    upload: z.object({
      method: z.literal('PUT'),
      url: z.string(),
      headers: z.record(z.string(), z.string()).openapi({
        description: 'Send these unchanged; the body must be exactly `size` bytes',
      }),
      expires_at: z.iso.datetime(),
    }),
  })
  .openapi('CreateUploadResponse');

export type CreateUploadInput = z.infer<typeof CreateUploadBody>;
