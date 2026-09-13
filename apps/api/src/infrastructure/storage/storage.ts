import { env } from '../../config/env';
import type { ObjectStorage } from './object-storage';
import { S3ObjectStorage } from './s3-object-storage';

/** null when S3_BUCKET is not set: file uploads are then disabled (ADR-017). */
export const objectStorage: ObjectStorage | null =
  env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? new S3ObjectStorage({
        ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      })
    : null;
