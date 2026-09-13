import type {
  ObjectStorage,
  PresignedDownload,
  PresignedUpload,
  StoredObject,
} from './object-storage';

const UPLOAD_PREFIX = 'memory://upload/';

/**
 * Object storage kept in this process, for tests. Presigned URLs use a memory:// scheme and
 * `receiveUpload` plays the client's PUT, enforcing the signed type and size like S3 does.
 */
export class MemoryObjectStorage implements ObjectStorage {
  readonly description = 'memory';
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  /** While false, every storage call fails, as in an outage. */
  available = true;
  private readonly signed = new Map<
    string,
    { contentType: string; size: number; expiresAt: Date }
  >();

  presignUpload(
    key: string,
    {
      contentType,
      size,
      expiresInSeconds,
    }: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<PresignedUpload> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    this.signed.set(key, { contentType, size, expiresAt });
    return Promise.resolve({
      method: 'PUT',
      url: `${UPLOAD_PREFIX}${encodeURIComponent(key)}`,
      headers: { 'Content-Type': contentType },
      expiresAt,
    });
  }

  /** The key a presigned upload URL points at. */
  keyOf(uploadUrl: string): string {
    return decodeURIComponent(uploadUrl.slice(UPLOAD_PREFIX.length));
  }

  /** The client's PUT to a presigned URL. Throws like storage answering 403. */
  receiveUpload(uploadUrl: string, bytes: Uint8Array, contentType: string): void {
    const key = this.keyOf(uploadUrl);
    const signed = this.signed.get(key);
    if (!signed || signed.expiresAt < new Date()) throw new Error('403: unknown or expired URL');
    if (signed.contentType !== contentType || signed.size !== bytes.length) {
      throw new Error('403: the request does not match the signature');
    }
    this.objects.set(key, { bytes, contentType });
  }

  presignDownload(
    key: string,
    { expiresInSeconds, signedAt }: { expiresInSeconds: number; signedAt: Date },
  ): Promise<PresignedDownload> {
    return Promise.resolve({
      url: `memory://download/${encodeURIComponent(key)}?signed=${signedAt.getTime()}`,
      expiresAt: new Date(signedAt.getTime() + expiresInSeconds * 1000),
    });
  }

  head(key: string): Promise<StoredObject | null> {
    return this.run(() => {
      const object = this.objects.get(key);
      return object ? { size: object.bytes.length } : null;
    });
  }

  readStart(key: string, length: number): Promise<Uint8Array> {
    return this.run(() => this.objects.get(key)?.bytes.slice(0, length) ?? new Uint8Array());
  }

  delete(key: string): Promise<void> {
    return this.run(() => {
      this.objects.delete(key);
    });
  }

  private run<T>(operation: () => T): Promise<T> {
    if (!this.available) return Promise.reject(new Error('Object storage is unavailable'));
    return Promise.resolve(operation());
  }
}
