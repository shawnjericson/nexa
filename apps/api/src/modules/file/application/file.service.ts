import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type {
  ObjectStorage,
  PresignedUpload,
} from '../../../infrastructure/storage/object-storage';
import { AppError } from '../../../shared/errors/app-error';
import type { OrganizationActor } from '../../organization';
import type { FileOwner, FileRecord, FileView } from '../domain/file';
import { FileErrors } from '../domain/file-errors';
import {
  SNIFF_BYTES,
  contentDisposition,
  contentMatches,
  kindOf,
  safeFilename,
  type AllowedMimeType,
} from '../domain/file-types';
import type { FileRepository } from '../domain/ports';

export interface FilePolicy {
  /** Largest accepted upload, in bytes. */
  maxBytes: number;
  /** Uploads one person may have in flight at once. */
  maxPendingUploads: number;
}

const HOUR_MS = 60 * 60 * 1000;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
// Download URLs are signed as of the start of the hour and valid for two hours: a file keeps the
// same URL (and browser cache entry) for an hour, and every URL handed out works for at least one.
const DOWNLOAD_URL_TTL_SECONDS = 2 * 60 * 60;
/** Uploads not completed within this time are marked FAILED and their object is deleted. */
const PENDING_TTL_MS = HOUR_MS;
/** Unattached READY files and FAILED records are purged after this grace period. */
const ORPHAN_GRACE_MS = 7 * 24 * HOUR_MS;

/**
 * Two-step uploads (ADR-017): createUpload reserves a record and a presigned URL, the client
 * PUTs the bytes straight to storage, and completeUpload verifies what arrived before anyone can
 * attach it.
 */
export class FileService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      files: FileRepository;
      storage: ObjectStorage | null;
      policy: FilePolicy;
      logger: Logger;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  private requireStorage(): ObjectStorage {
    if (!this.deps.storage) throw FileErrors.storageNotConfigured();
    return this.deps.storage;
  }

  async createUpload(
    actor: OrganizationActor,
    input: { filename: string; mimeType: AllowedMimeType; size: number },
  ): Promise<{ file: FileRecord; upload: PresignedUpload }> {
    const storage = this.requireStorage();
    // Rejected before anything is stored (risk register 13: oversized file).
    const { maxBytes, maxPendingUploads } = this.deps.policy;
    if (input.size > maxBytes) throw FileErrors.tooLarge(maxBytes);
    const pending = await this.deps.files.countPending(
      actor.userId,
      new Date(this.now().getTime() - PENDING_TTL_MS),
    );
    if (pending >= maxPendingUploads) throw FileErrors.tooManyPending();

    const organizationId = actor.organization.organizationId;
    const file = await this.deps.files.create({
      organizationId,
      uploadedById: actor.userId,
      // Random and never derived from the filename, so names can't collide or traverse paths.
      storageKey: `org/${organizationId}/files/${randomUUID()}`,
      filename: safeFilename(input.filename, input.mimeType),
      mimeType: input.mimeType,
      size: input.size,
    });
    const upload = await storage.presignUpload(file.storageKey, {
      contentType: file.mimeType,
      size: file.size,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return { file, upload };
  }

  /** Idempotent: completing a READY file returns it again. */
  async completeUpload(actor: OrganizationActor, id: string): Promise<FileRecord> {
    const storage = this.requireStorage();
    const file = await this.getOwn(actor, id);
    if (file.status === 'READY') return file;
    if (file.status === 'FAILED') throw FileErrors.uploadFailed(file.failureReason ?? 'unknown');

    const problem = await this.inspect(storage, file);
    if (problem) {
      // Never keep a disguised or broken file: delete the object, keep the record as FAILED.
      await storage
        .delete(file.storageKey)
        .catch((err: unknown) =>
          this.deps.logger.warn({ err, file_id: file.id }, 'Could not delete a rejected upload'),
        );
      await this.deps.files.markFailed(file.id, problem);
      throw FileErrors.rejected(problem);
    }

    const ready = await this.deps.files.markReady(file.id, this.now());
    if (ready) return ready;
    // A concurrent completion or the cleanup job decided first.
    const current = await this.getOwn(actor, id);
    if (current.status === 'FAILED') {
      throw FileErrors.uploadFailed(current.failureReason ?? 'unknown');
    }
    return current;
  }

  /** Why the stored object is unacceptable, or null when it is what was announced. */
  private async inspect(storage: ObjectStorage, file: FileRecord): Promise<string | null> {
    try {
      const stored = await storage.head(file.storageKey);
      if (!stored) throw FileErrors.uploadIncomplete();
      if (stored.size !== file.size) {
        return `expected ${file.size} bytes but received ${stored.size}`;
      }
      const start = await storage.readStart(file.storageKey, SNIFF_BYTES);
      return contentMatches(file.mimeType, start) ? null : `its content is not ${file.mimeType}`;
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Storage is down: the file stays PENDING and the client can simply retry (risk register 13).
      this.deps.logger.warn({ err, file_id: file.id }, 'Object storage failed during an upload');
      throw FileErrors.storageUnavailable();
    }
  }

  /** The caller's own upload, whatever its status. */
  async getOwn(actor: OrganizationActor, id: string): Promise<FileRecord> {
    const file = await this.deps.files.findById(actor.organization.organizationId, id);
    if (!file || file.uploadedById !== actor.userId) throw FileErrors.notFound();
    return file;
  }

  /** The owner's READY files, in the given order. Throws for anything else. */
  async requireAttachable(owner: FileOwner, ids: readonly string[]): Promise<FileRecord[]> {
    if (ids.length === 0) return [];
    const found = new Map(
      (await this.deps.files.findMany(owner.organizationId, ids)).map((file) => [file.id, file]),
    );
    return ids.map((id) => {
      const file = found.get(id);
      if (!file || file.uploadedById !== owner.userId) throw FileErrors.notFound();
      if (file.status !== 'READY') throw FileErrors.notReady();
      return file;
    });
  }

  /**
   * Download views for content the caller is already allowed to see; access is decided by the
   * post or conversation that shows the files. Files that are gone or not READY are left out.
   */
  async describe(organizationId: string, ids: readonly string[]): Promise<Map<string, FileView>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || !this.deps.storage) return new Map();
    return this.views(await this.deps.files.findMany(organizationId, unique));
  }

  async views(files: readonly FileRecord[]): Promise<Map<string, FileView>> {
    const storage = this.deps.storage;
    if (!storage) return new Map();
    const signedAt = new Date(Math.floor(this.now().getTime() / HOUR_MS) * HOUR_MS);

    const entries = await Promise.all(
      files
        .filter((file) => file.status === 'READY')
        .map(async (file): Promise<[string, FileView]> => {
          const kind = kindOf(file.mimeType);
          const { url, expiresAt } = await storage.presignDownload(file.storageKey, {
            contentType: file.mimeType,
            // Images and videos show in place, everything else downloads. Either way the bytes
            // come from the storage domain, never from the API's origin.
            contentDisposition: contentDisposition(
              file.filename,
              kind === 'image' || kind === 'video',
            ),
            expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
            signedAt,
          });
          return [
            file.id,
            {
              id: file.id,
              filename: file.filename,
              mimeType: file.mimeType,
              kind,
              size: file.size,
              url,
              urlExpiresAt: expiresAt,
            },
          ];
        }),
    );
    return new Map(entries);
  }

  /** Largest picture accepted as an avatar. */
  static readonly AVATAR_MAX_BYTES = 5 * 1024 * 1024;

  /** The caller's own READY picture, small enough to be an avatar. */
  async requireAvatarPicture(actor: OrganizationActor, id: string): Promise<FileRecord> {
    const file = await this.getOwn(actor, id);
    if (file.status !== 'READY') throw FileErrors.notReady();
    if (kindOf(file.mimeType) !== 'image') throw FileErrors.notAnImage();
    if (file.size > FileService.AVATAR_MAX_BYTES) {
      throw FileErrors.tooLarge(FileService.AVATAR_MAX_BYTES);
    }
    return file;
  }

  /** A download URL for a file that is someone's avatar; null for every other file. */
  async avatarDownloadUrl(id: string): Promise<string | null> {
    if (!this.deps.storage) return null;
    const file = await this.deps.files.findAvatar(id);
    if (!file) return null;
    return (await this.views([file])).get(file.id)?.url ?? null;
  }

  /**
   * Background job (risk register 13: orphan files):
   * - uploads never completed are marked FAILED and their object deleted;
   * - after a grace period, FAILED records and READY files nothing references are purged.
   */
  async cleanup(limit = 100): Promise<{ expired: number; purged: number }> {
    const storage = this.deps.storage;
    if (!storage) return { expired: 0, purged: 0 };
    const now = this.now().getTime();

    let expired = 0;
    for (const file of await this.deps.files.listStalePending(
      new Date(now - PENDING_TTL_MS),
      limit,
    )) {
      // Marking first: if the client completes at the same moment, only one of the two wins.
      if (!(await this.deps.files.markFailed(file.id, 'the upload was not completed in time'))) {
        continue;
      }
      await storage.delete(file.storageKey);
      expired += 1;
    }

    let purged = 0;
    for (const file of await this.deps.files.listPurgeable(
      new Date(now - ORPHAN_GRACE_MS),
      limit,
    )) {
      // The record goes first: its foreign keys refuse while anything references the file, so a
      // referenced object is never deleted (risk register 13).
      if (!(await this.deps.files.deleteUnreferenced(file.id))) continue;
      purged += 1;
      await storage
        .delete(file.storageKey)
        .catch((err: unknown) =>
          this.deps.logger.warn(
            { err, storage_key: file.storageKey },
            'Purged a file record but could not delete its object',
          ),
        );
    }
    return { expired, purged };
  }
}
