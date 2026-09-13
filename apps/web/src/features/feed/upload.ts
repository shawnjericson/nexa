import { unwrap } from '@nexa/api-client';
import { api } from '@/lib/api/client';
import type { AllowedContentType, UploadedFile } from '@/lib/types';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Mirrors the API's allowlist (ADR-017); the API checks the real bytes anyway. */
export const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
  'text/csv',
] as const satisfies readonly AllowedContentType[];

/** For `<input type="file" accept>`. */
export const ACCEPT_ATTRIBUTE = ALLOWED_TYPES.join(',');

export function isAllowedType(type: string): type is AllowedContentType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

export type UploadFailure = 'too-large' | 'unsupported' | 'failed';

export class UploadError extends Error {
  constructor(readonly reason: UploadFailure) {
    super(reason);
    this.name = 'UploadError';
  }
}

/**
 * Two-step upload (ADR-017): reserve the file, PUT the bytes straight to object storage with the
 * presigned URL, then let the API check what arrived.
 */
export async function uploadFile(
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  if (!isAllowedType(file.type)) throw new UploadError('unsupported');
  if (file.size > MAX_FILE_BYTES) throw new UploadError('too-large');

  const { file: record, upload } = await unwrap(
    api.POST('/api/v1/files', {
      body: { filename: file.name, content_type: file.type, size: file.size },
    }),
  );
  await putWithProgress(upload.url, upload.headers, file, onProgress, signal);
  try {
    return await unwrap(
      api.POST('/api/v1/files/{id}/complete', { params: { path: { id: record.id } } }),
    );
  } catch {
    throw new UploadError('failed');
  }
}

/** XMLHttpRequest rather than fetch: it reports upload progress. */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadError('failed'));
    request.onerror = () => reject(new UploadError('failed'));
    request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(file);
  });
}
