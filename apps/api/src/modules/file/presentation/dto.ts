import type { PresignedUpload } from '../../../infrastructure/storage/object-storage';
import type { FileRecord, FileView } from '../domain/file';
import { kindOf } from '../domain/file-types';

export function toAttachmentResponse(view: FileView) {
  return {
    id: view.id,
    filename: view.filename,
    content_type: view.mimeType,
    kind: view.kind,
    size: view.size,
    url: view.url,
    url_expires_at: view.urlExpiresAt.toISOString(),
  };
}

/** Attachments in display order; files that are gone or not READY are left out. */
export function toAttachmentsResponse(
  ids: readonly string[],
  views: ReadonlyMap<string, FileView>,
) {
  return ids.flatMap((id) => {
    const view = views.get(id);
    return view ? [toAttachmentResponse(view)] : [];
  });
}

export function toFileResponse(file: FileRecord, view: FileView | undefined) {
  return {
    id: file.id,
    filename: file.filename,
    content_type: file.mimeType,
    kind: kindOf(file.mimeType),
    size: file.size,
    status: file.status,
    failure_reason: file.failureReason,
    url: view?.url ?? null,
    url_expires_at: view?.urlExpiresAt.toISOString() ?? null,
    created_at: file.createdAt.toISOString(),
    uploaded_at: file.uploadedAt?.toISOString() ?? null,
  };
}

export function toUploadResponse(upload: PresignedUpload) {
  return {
    method: upload.method,
    url: upload.url,
    headers: upload.headers,
    expires_at: upload.expiresAt.toISOString(),
  };
}
