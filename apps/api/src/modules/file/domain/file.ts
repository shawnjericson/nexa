export type FileStatus = 'PENDING' | 'READY' | 'FAILED';

export type FileKind = 'image' | 'video' | 'document' | 'archive';

export interface FileRecord {
  id: string;
  organizationId: string;
  uploadedById: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  /** PENDING until the uploaded object has been verified. */
  status: FileStatus;
  failureReason: string | null;
  createdAt: Date;
  uploadedAt: Date | null;
}

/** A READY file as shown to someone allowed to see it, with a short-lived download URL. */
export interface FileView {
  id: string;
  filename: string;
  mimeType: string;
  kind: FileKind;
  size: number;
  url: string;
  urlExpiresAt: Date;
}

/** Who attaches files: only their own uploads, in the organization they act in. */
export interface FileOwner {
  organizationId: string;
  userId: string;
}
