/** A presigned upload: the client sends the bytes straight to storage, never through the API. */
export interface PresignedUpload {
  method: 'PUT';
  url: string;
  /** Headers the client must send unchanged: they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PresignedDownload {
  url: string;
  expiresAt: Date;
}

export interface StoredObject {
  size: number;
}

/** Object storage port: S3-compatible services (Cloudflare R2) in production, memory in tests. */
export interface ObjectStorage {
  /** For logs, e.g. "s3:nexa". */
  readonly description: string;
  /** The signature pins the content type and the exact size of the body. */
  presignUpload(
    key: string,
    options: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<PresignedUpload>;
  /** Signing is local: no request to the storage service. */
  presignDownload(
    key: string,
    options: {
      contentType: string;
      contentDisposition: string;
      expiresInSeconds: number;
      signedAt: Date;
    },
  ): Promise<PresignedDownload>;
  /** null when there is no such object. */
  head(key: string): Promise<StoredObject | null>;
  /** The first `length` bytes, or fewer when the object is smaller. */
  readStart(key: string, length: number): Promise<Uint8Array>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
}
