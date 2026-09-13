import type { FileRecord } from './file';

export interface NewFile {
  organizationId: string;
  uploadedById: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface FileRepository {
  create(file: NewFile): Promise<FileRecord>;
  findById(organizationId: string, id: string): Promise<FileRecord | null>;
  findMany(organizationId: string, ids: readonly string[]): Promise<FileRecord[]>;
  /** The person's PENDING uploads created since `since`. */
  countPending(uploadedById: string, since: Date): Promise<number>;
  /** Only moves a PENDING file; null when it is no longer pending (someone else decided first). */
  markReady(id: string, at: Date): Promise<FileRecord | null>;
  /** Only moves a PENDING file; null when it is no longer pending. */
  markFailed(id: string, reason: string): Promise<FileRecord | null>;
  /** PENDING uploads created before `before`, oldest first. */
  listStalePending(before: Date, take: number): Promise<FileRecord[]>;
  /**
   * READY files uploaded before `before` that no post or message references, and FAILED files
   * created before it.
   */
  listPurgeable(before: Date, take: number): Promise<FileRecord[]>;
  /**
   * Deletes the record unless a post or message references it - the foreign keys decide, so a
   * reference added concurrently always wins. Returns whether it was deleted.
   */
  deleteUnreferenced(id: string): Promise<boolean>;
}
