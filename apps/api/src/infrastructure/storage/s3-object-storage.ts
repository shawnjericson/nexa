import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ObjectStorage,
  PresignedDownload,
  PresignedUpload,
  StoredObject,
} from './object-storage';

export interface S3StorageConfig {
  /** e.g. https://<account id>.r2.cloudflarestorage.com; leave out for AWS S3. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof S3ServiceException &&
    (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata.httpStatusCode === 404)
  );
}

const expiry = (from: Date, seconds: number) => new Date(from.getTime() + seconds * 1000);

/** Any S3-compatible service; the bucket stays private and every URL is presigned (ADR-017). */
export class S3ObjectStorage implements ObjectStorage {
  readonly description: string;
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.description = `s3:${config.bucket}`;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint && { endpoint: config.endpoint }),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // The SDK would otherwise put CRC32 checksum parameters into presigned URLs, which browsers
      // can't satisfy and S3-compatible services such as R2 don't all accept.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    });
  }

  async presignUpload(
    key: string,
    {
      contentType,
      size,
      expiresInSeconds,
    }: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<PresignedUpload> {
    const signedAt = new Date();
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });
    // Content-Length is signed, so storage refuses a body of any other size (risk register 13).
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
      signingDate: signedAt,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': contentType },
      expiresAt: expiry(signedAt, expiresInSeconds),
    };
  }

  async presignDownload(
    key: string,
    options: {
      contentType: string;
      contentDisposition: string;
      expiresInSeconds: number;
      signedAt: Date;
    },
  ): Promise<PresignedDownload> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: options.contentDisposition,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
      signingDate: options.signedAt,
    });
    return { url, expiresAt: expiry(options.signedAt, options.expiresInSeconds) };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async readStart(key: string, length: number): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: `bytes=0-${length - 1}`,
      }),
    );
    return result.Body ? result.Body.transformToByteArray() : new Uint8Array();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
