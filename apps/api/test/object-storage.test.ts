import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { S3ObjectStorage } from '../src/infrastructure/storage/s3-object-storage';
import { contentDisposition } from '../src/modules/file/domain/file-types';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { PDF } from './helpers/files';
import { createTeam } from './helpers/team';

// Talks to the real bucket in TEST_S3_BUCKET (Cloudflare R2), under test/, and deletes what it
// creates. Skipped when no credentials are configured.
const config = {
  endpoint: process.env.TEST_S3_ENDPOINT ?? '',
  region: process.env.TEST_S3_REGION || 'auto',
  bucket: process.env.TEST_S3_BUCKET ?? '',
  accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? '',
};
const configured = Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);

describe.skipIf(!configured)('S3-compatible object storage', () => {
  const storage = new S3ObjectStorage({
    ...(config.endpoint && { endpoint: config.endpoint }),
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const created: string[] = [];
  const newKey = () => {
    const key = `test/${randomUUID()}`;
    created.push(key);
    return key;
  };

  afterAll(async () => {
    await Promise.all(created.map((key) => storage.delete(key)));
    await prisma.$disconnect();
  });

  async function put(key: string, bytes: Uint8Array, contentType = 'application/pdf') {
    const upload = await storage.presignUpload(key, {
      contentType,
      size: bytes.length,
      expiresInSeconds: 300,
    });
    return fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes });
  }

  it('accepts a presigned upload of exactly the signed type and size', async () => {
    const key = newKey();

    const res = await put(key, PDF);

    expect(res.status).toBe(200);
    expect(await storage.head(key)).toEqual({ size: PDF.length });
    expect(Array.from(await storage.readStart(key, 5))).toEqual(Array.from(PDF.slice(0, 5)));
  });

  it('refuses a body of another size or type than was signed', async () => {
    const key = newKey();
    const upload = await storage.presignUpload(key, {
      contentType: 'application/pdf',
      size: PDF.length,
      expiresInSeconds: 300,
    });

    const bigger = await fetch(upload.url, {
      method: 'PUT',
      headers: upload.headers,
      body: new Uint8Array([...PDF, 0x20]),
    });
    const otherType = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html' },
      body: PDF,
    });

    expect(bigger.status).toBe(403);
    expect(otherType.status).toBe(403);
    expect(await storage.head(key)).toBeNull();
  });

  it('serves downloads with the requested headers, and deletes idempotently', async () => {
    const key = newKey();
    await put(key, PDF);

    const download = await storage.presignDownload(key, {
      contentType: 'application/pdf',
      contentDisposition: contentDisposition('Báo cáo.pdf', false),
      expiresInSeconds: 300,
      signedAt: new Date(),
    });
    const res = await fetch(download.url);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''B%C3%A1o%20c%C3%A1o.pdf",
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);

    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
  });

  it('runs a whole upload through the API', async () => {
    await resetDatabase();
    const app = createApp({ prisma, storage });
    const { alice } = await createTeam(app);

    const started = await request(app)
      .post('/api/v1/files')
      .set(bearer(alice.accessToken))
      .send({ filename: 'hello.pdf', content_type: 'application/pdf', size: PDF.length });
    const { file, upload } = started.body.data;
    created.push(
      (
        await prisma.file.findUniqueOrThrow({
          where: { id: file.id },
          select: { storageKey: true },
        })
      ).storageKey,
    );
    const sent = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: PDF });
    const done = await request(app)
      .post(`/api/v1/files/${file.id}/complete`)
      .set(bearer(alice.accessToken));
    const downloaded = await fetch(done.body.data.url);

    expect(started.status).toBe(201);
    expect(sent.status).toBe(200);
    expect(done.body.data.status).toBe('READY');
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(PDF);
  });
});
