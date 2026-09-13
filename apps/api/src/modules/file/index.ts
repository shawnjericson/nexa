import type { RequestHandler, Router } from 'express';
import type { PrismaClient } from '../../generated/prisma/client';
import { logger } from '../../infrastructure/logger/logger';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage';
import { FileService, type FilePolicy } from './application/file.service';
import type { FileKind, FileOwner, FileView } from './domain/file';
import { kindOf } from './domain/file-types';
import { PrismaFileRepository } from './infrastructure/prisma-file.repository';
import './presentation/openapi';
import { createFileRouter } from './presentation/routes';

// Public contract of the File module.
export type { FileKind, FileOwner, FileView } from './domain/file';
export { toAttachmentsResponse } from './presentation/dto';
export { AttachmentIds, AttachmentResponse, MAX_ATTACHMENTS } from './presentation/schemas';

/** How other modules attach files to their content and show them (spec 12). */
export interface FileDirectory {
  /**
   * The owner's own READY files in the organization, in the given order. Throws FILE_NOT_FOUND
   * for missing or someone else's files and FILE_NOT_READY for unfinished uploads.
   */
  requireAttachable(
    owner: FileOwner,
    ids: readonly string[],
  ): Promise<Array<{ id: string; kind: FileKind }>>;
  /**
   * Download views for content the caller is already allowed to see; the post or conversation
   * decides access. Files that are gone or not READY are left out.
   */
  describe(organizationId: string, ids: readonly string[]): Promise<Map<string, FileView>>;
}

export interface FileModule {
  /** Upload endpoints, mounted under /api/v1. */
  router: Router;
  directory: FileDirectory;
}

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export function createFileModule(deps: {
  prisma: PrismaClient;
  /** null disables uploads (no bucket configured). */
  storage: ObjectStorage | null;
  policy: FilePolicy;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
  /** Start the periodic cleanup of abandoned uploads and orphans (the server does; tests don't). */
  backgroundJobs?: boolean;
}): FileModule {
  const files = new FileService({
    files: new PrismaFileRepository(deps.prisma),
    storage: deps.storage,
    policy: deps.policy,
    logger,
  });

  if (deps.storage && deps.backgroundJobs) {
    setInterval(() => {
      files
        .cleanup()
        .then((result) => {
          if (result.expired > 0 || result.purged > 0) logger.info(result, 'File cleanup');
        })
        .catch((err: unknown) => logger.warn({ err }, 'File cleanup failed'));
    }, CLEANUP_INTERVAL_MS).unref();
  }

  return {
    router: createFileRouter({ files, guard: deps.guard }),
    directory: {
      requireAttachable: async (owner, ids) =>
        (await files.requireAttachable(owner, ids)).map((file) => ({
          id: file.id,
          kind: kindOf(file.mimeType),
        })),
      describe: (organizationId, ids) => files.describe(organizationId, ids),
    },
  };
}
