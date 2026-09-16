import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { logger } from '../src/infrastructure/logger/logger';
import { MemoryObjectStorage } from '../src/infrastructure/storage/memory-object-storage';
import { FileService } from '../src/modules/file/application/file.service';
import { PrismaFileRepository } from '../src/modules/file/infrastructure/prisma-file.repository';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { PDF, PNG } from './helpers/files';

const storage = new MemoryObjectStorage();
const app = createApp({ prisma, storage });

beforeEach(async () => {
  await resetDatabase();
  storage.objects.clear();
  storage.available = true;
});
afterAll(() => prisma.$disconnect());

/** Starts, sends and completes an upload; returns the READY file's id. */
async function upload(token: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const started = await request(app)
    .post('/api/v1/files')
    .set(bearer(token))
    .send({ filename: 'picture', content_type: contentType, size: bytes.length });
  expect(started.status).toBe(201);
  storage.receiveUpload(started.body.data.upload.url, bytes, contentType);
  const completed = await request(app)
    .post(`/api/v1/files/${started.body.data.file.id}/complete`)
    .set(bearer(token));
  expect(completed.status).toBe(200);
  return completed.body.data.id as string;
}

const setAvatar = (token: string, fileId: string) =>
  request(app).put('/api/v1/users/me/avatar').set(bearer(token)).send({ file_id: fileId });

describe('avatars', () => {
  it('uses an uploaded picture as the avatar and serves it to img tags', async () => {
    const alice = await registerAndLogin(app);
    const fileId = await upload(alice.accessToken, PNG, 'image/png');

    const set = await setAvatar(alice.accessToken, fileId);
    expect(set.status).toBe(200);
    expect(set.body.data.avatar_url).toMatch(new RegExp(`/api/v1/avatars/${fileId}$`));

    const me = await request(app).get('/api/v1/users/me').set(bearer(alice.accessToken));
    expect(me.body.data.avatar_url).toBe(set.body.data.avatar_url);

    // No credentials: <img> tags can't send them.
    const picture = await request(app).get(`/api/v1/avatars/${fileId}`);
    expect(picture.status).toBe(302);
    expect(picture.headers.location).toMatch(/^memory:\/\/|^https?:\/\//);
    expect(picture.headers['cache-control']).toBe('public, max-age=3600');
    expect(picture.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it("serves only files that are someone's avatar", async () => {
    const alice = await registerAndLogin(app);
    const fileId = await upload(alice.accessToken, PNG, 'image/png');

    const res = await request(app).get(`/api/v1/avatars/${fileId}`);
    expect(res.status).toBe(404);
  });

  it("refuses documents and other people's pictures", async () => {
    const alice = await registerAndLogin(app);
    const bob = await registerAndLogin(app);
    const pdf = await upload(alice.accessToken, PDF, 'application/pdf');
    const png = await upload(alice.accessToken, PNG, 'image/png');

    const document = await setAvatar(alice.accessToken, pdf);
    expect(document.status).toBe(422);
    expect(document.body.code).toBe('NOT_AN_IMAGE');

    const stolen = await setAvatar(bob.accessToken, png);
    expect(stolen.status).toBe(404);
  });

  it('keeps the avatar out of the orphan cleanup and lets the previous picture go', async () => {
    const alice = await registerAndLogin(app);
    const first = await upload(alice.accessToken, PNG, 'image/png');
    const second = await upload(alice.accessToken, PNG, 'image/png');
    await setAvatar(alice.accessToken, first);
    await setAvatar(alice.accessToken, second);

    const eightDaysLater = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const cleanup = new FileService({
      files: new PrismaFileRepository(prisma),
      storage,
      policy: { maxBytes: 25 * 1024 * 1024, maxPendingUploads: 20 },
      logger,
      now: () => eightDaysLater,
    });
    await cleanup.cleanup();

    expect(await prisma.file.findUnique({ where: { id: first } })).toBeNull();
    expect(await prisma.file.findUnique({ where: { id: second } })).not.toBeNull();
  });

  it('removes the avatar, and a picture link replaces an uploaded one', async () => {
    const alice = await registerAndLogin(app);
    const fileId = await upload(alice.accessToken, PNG, 'image/png');
    await setAvatar(alice.accessToken, fileId);

    const removed = await request(app)
      .delete('/api/v1/users/me/avatar')
      .set(bearer(alice.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data.avatar_url).toBeNull();
    expect((await request(app).get(`/api/v1/avatars/${fileId}`)).status).toBe(404);

    await setAvatar(alice.accessToken, fileId);
    const linked = await request(app)
      .put('/api/v1/users/me')
      .set(bearer(alice.accessToken))
      .send({ avatar_url: 'https://cdn.example.com/me.png' });
    expect(linked.body.data.avatar_url).toBe('https://cdn.example.com/me.png');
    expect((await request(app).get(`/api/v1/avatars/${fileId}`)).status).toBe(404);
  });
});
