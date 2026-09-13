import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { logger } from '../src/infrastructure/logger/logger';
import { MemoryObjectStorage } from '../src/infrastructure/storage/memory-object-storage';
import { FileService } from '../src/modules/file/application/file.service';
import { PrismaFileRepository } from '../src/modules/file/infrastructure/prisma-file.repository';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { EXE, PDF, PNG } from './helpers/files';
import { createTeam, moveToNewOrganization } from './helpers/team';

const storage = new MemoryObjectStorage();
const app = createApp({ prisma, storage });

beforeEach(async () => {
  await resetDatabase();
  storage.objects.clear();
  storage.available = true;
});
afterAll(() => prisma.$disconnect());

interface FileBody {
  id: string;
  filename: string;
  content_type: string;
  kind: string;
  size: number;
  status: string;
  failure_reason: string | null;
  url: string | null;
}

const startUpload = (
  token: string,
  input: { filename: string; content_type: string; size: number },
) => request(app).post('/api/v1/files').set(bearer(token)).send(input);

const complete = (token: string, id: string) =>
  request(app).post(`/api/v1/files/${id}/complete`).set(bearer(token));

/** Starts, sends and completes an upload; returns the READY file. */
async function uploadFile(
  token: string,
  bytes: Uint8Array,
  contentType: string,
  filename = 'file',
) {
  const started = await startUpload(token, {
    filename,
    content_type: contentType,
    size: bytes.length,
  });
  expect(started.status).toBe(201);
  storage.receiveUpload(started.body.data.upload.url, bytes, contentType);
  const completed = await complete(token, started.body.data.file.id);
  expect(completed.status).toBe(200);
  return completed.body.data as FileBody;
}

const createPost = (token: string, body: object) =>
  request(app).post('/api/v1/posts').set(bearer(token)).send(body);

describe('uploads', () => {
  it('sends the bytes straight to storage and checks them before the file can be used', async () => {
    const { alice, bob } = await createTeam(app);
    const started = await startUpload(alice.accessToken, {
      filename: 'Ảnh team.png',
      content_type: 'image/png',
      size: PNG.length,
    });
    const { file, upload } = started.body.data;

    expect(started.status).toBe(201);
    expect(file).toMatchObject({
      filename: 'Ảnh team.png',
      content_type: 'image/png',
      kind: 'image',
      size: PNG.length,
      status: 'PENDING',
      url: null,
    });
    expect(upload).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });

    const early = await complete(alice.accessToken, file.id);
    // The signature pins the type and size, like S3/R2 do.
    expect(() => storage.receiveUpload(upload.url, PDF, 'image/png')).toThrow('403');
    storage.receiveUpload(upload.url, PNG, 'image/png');
    const done = await complete(alice.accessToken, file.id);
    const again = await complete(alice.accessToken, file.id);
    const asUploader = await request(app)
      .get(`/api/v1/files/${file.id}`)
      .set(bearer(alice.accessToken));
    const asBob = await request(app).get(`/api/v1/files/${file.id}`).set(bearer(bob.accessToken));

    expect(early.status).toBe(409);
    expect(early.body.code).toBe('UPLOAD_INCOMPLETE');
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({
      id: file.id,
      status: 'READY',
      url: expect.stringContaining('memory://download/'),
    });
    expect(again.body.data.status).toBe('READY');
    expect(asUploader.body.data.status).toBe('READY');
    expect(asBob.status).toBe(404);
    expect(asBob.body.code).toBe('FILE_NOT_FOUND');
  });

  it('refuses types outside the allowlist and oversized files before storing anything', async () => {
    const { alice } = await createTeam(app);

    const exe = await startUpload(alice.accessToken, {
      filename: 'setup.exe',
      content_type: 'application/x-msdownload',
      size: 10,
    });
    const svg = await startUpload(alice.accessToken, {
      filename: 'logo.svg',
      content_type: 'image/svg+xml',
      size: 10,
    });
    const huge = await startUpload(alice.accessToken, {
      filename: 'movie.mp4',
      content_type: 'video/mp4',
      size: 25 * 1024 * 1024 + 1,
    });

    expect(exe.status).toBe(400);
    expect(exe.body.details[0].field).toBe('body.content_type');
    expect(svg.status).toBe(400);
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe('FILE_TOO_LARGE');
    expect(await prisma.file.count()).toBe(0);
  });

  it('rejects content that is not what it claims to be, and deletes it (13: fake MIME type)', async () => {
    const { alice } = await createTeam(app);
    const started = await startUpload(alice.accessToken, {
      filename: 'cat.png',
      content_type: 'image/png',
      size: EXE.length,
    });
    const { file, upload } = started.body.data;
    storage.receiveUpload(upload.url, EXE, 'image/png');

    const rejected = await complete(alice.accessToken, file.id);
    const retried = await complete(alice.accessToken, file.id);

    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('FILE_REJECTED');
    expect(retried.status).toBe(409);
    expect(retried.body.code).toBe('UPLOAD_FAILED');
    expect(storage.objects.size).toBe(0);
    expect(
      await prisma.file.findUniqueOrThrow({
        where: { id: file.id },
        select: { status: true, failureReason: true },
      }),
    ).toEqual({ status: 'FAILED', failureReason: 'its content is not image/png' });
  });

  it('rejects an object of another size than announced', async () => {
    const { alice } = await createTeam(app);
    const started = await startUpload(alice.accessToken, {
      filename: 'report.pdf',
      content_type: 'application/pdf',
      size: PDF.length + 10,
    });
    // Bypasses the signature check, as a misbehaving storage service might.
    storage.objects.set(storage.keyOf(started.body.data.upload.url), {
      bytes: PDF,
      contentType: 'application/pdf',
    });

    const res = await complete(alice.accessToken, started.body.data.file.id);

    expect(res.status).toBe(422);
    expect(res.body.error).toContain(
      `expected ${PDF.length + 10} bytes but received ${PDF.length}`,
    );
  });

  it('keeps the upload pending while storage is down, so the client can retry', async () => {
    const { alice } = await createTeam(app);
    const started = await startUpload(alice.accessToken, {
      filename: 'report.pdf',
      content_type: 'application/pdf',
      size: PDF.length,
    });
    storage.receiveUpload(started.body.data.upload.url, PDF, 'application/pdf');

    storage.available = false;
    const down = await complete(alice.accessToken, started.body.data.file.id);
    storage.available = true;
    const up = await complete(alice.accessToken, started.body.data.file.id);

    expect(down.status).toBe(503);
    expect(down.body.code).toBe('FILE_STORAGE_UNAVAILABLE');
    expect(up.body.data.status).toBe('READY');
  });

  it('cleans file names and makes the extension match the type', async () => {
    const { alice } = await createTeam(app);
    const upload = (filename: string) =>
      startUpload(alice.accessToken, {
        filename,
        content_type: 'application/pdf',
        size: PDF.length,
      });

    const disguised = await upload('C:\\Users\\me\\..\\invoice.exe');
    const report = await upload('Báo cáo "Q3".PDF');
    const hidden = await upload('../../.env');

    expect(disguised.body.data.file.filename).toBe('invoice.exe.pdf');
    expect(report.body.data.file.filename).toBe('Báo cáo Q3.pdf');
    expect(hidden.body.data.file.filename).toBe('env.pdf');
  });

  it('limits how many unfinished uploads one person can have', async () => {
    const { alice } = await createTeam(app);
    const start = () =>
      startUpload(alice.accessToken, { filename: 'a.png', content_type: 'image/png', size: 10 });

    // FILE_MAX_PENDING_UPLOADS is 5 in tests.
    for (let i = 0; i < 5; i += 1) expect((await start()).status).toBe(201);
    const sixth = await start();

    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('TOO_MANY_PENDING_UPLOADS');
  });

  it('answers 503 when no storage is configured', async () => {
    const withoutStorage = createApp({ prisma });
    const { alice } = await createTeam(withoutStorage);

    const res = await request(withoutStorage)
      .post('/api/v1/files')
      .set(bearer(alice.accessToken))
      .send({ filename: 'a.png', content_type: 'image/png', size: 10 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('FILE_STORAGE_UNAVAILABLE');
  });
});

describe('attachments', () => {
  it('shows attachments of a post to the organization, in order, with download URLs', async () => {
    const { alice, bob } = await createTeam(app);
    const photo = await uploadFile(alice.accessToken, PNG, 'image/png', 'team.png');
    const report = await uploadFile(alice.accessToken, PDF, 'application/pdf', 'report.pdf');

    const created = await createPost(alice.accessToken, {
      content: 'Team outing',
      attachment_ids: [report.id, photo.id],
    });
    const asBob = await request(app)
      .get(`/api/v1/posts/${created.body.data.id}`)
      .set(bearer(bob.accessToken));
    const feed = await request(app).get('/api/v1/feed').set(bearer(bob.accessToken));
    const exam = await request(app)
      .get(`/api/posts/${created.body.data.id}`)
      .set(bearer(bob.accessToken));

    expect(created.status).toBe(201);
    expect(
      (created.body.data.attachments as FileBody[]).map((file) => [file.id, file.kind]),
    ).toEqual([
      [report.id, 'document'],
      [photo.id, 'image'],
    ]);
    expect(asBob.body.data.attachments[0]).toMatchObject({
      id: report.id,
      filename: 'report.pdf',
      content_type: 'application/pdf',
      size: PDF.length,
      url: expect.stringContaining('memory://download/'),
      url_expires_at: expect.any(String),
    });
    expect(feed.body.data[0].attachments).toHaveLength(2);
    expect(exam.body.data.attachments).toHaveLength(2);
  });

  it('attaches only your own finished uploads from the same organization', async () => {
    const { alice, bob } = await createTeam(app);
    const bobsFile = await uploadFile(bob.accessToken, PNG, 'image/png');
    const unfinished = (
      await startUpload(alice.accessToken, {
        filename: 'x.png',
        content_type: 'image/png',
        size: PNG.length,
      })
    ).body.data.file.id as string;
    const mallory = await registerAndLogin(app);
    await moveToNewOrganization(mallory.user.id, 'rival-company');
    const rivalFile = await uploadFile(mallory.accessToken, PNG, 'image/png');
    const ownFile = await uploadFile(alice.accessToken, PNG, 'image/png');
    const post = (ids: string[]) =>
      createPost(alice.accessToken, { content: 'with files', attachment_ids: ids });

    const someoneElses = await post([bobsFile.id]);
    const pending = await post([unfinished]);
    const otherOrganization = await post([rivalFile.id]);
    const unknown = await post([randomUUID()]);
    const twice = await post([ownFile.id, ownFile.id]);

    expect(someoneElses.status).toBe(404);
    expect(someoneElses.body.code).toBe('FILE_NOT_FOUND');
    expect(pending.status).toBe(409);
    expect(pending.body.code).toBe('FILE_NOT_READY');
    expect(otherOrganization.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(twice.status).toBe(400);
    expect(await prisma.post.count()).toBe(0);
  });

  it('replaces the attachments when the author edits the post', async () => {
    const { alice } = await createTeam(app);
    const first = await uploadFile(alice.accessToken, PNG, 'image/png');
    const second = await uploadFile(alice.accessToken, PDF, 'application/pdf');
    const post = (
      await createPost(alice.accessToken, { content: 'v1', attachment_ids: [first.id] })
    ).body.data as { id: string };
    const edit = (body: object) =>
      request(app).put(`/api/v1/posts/${post.id}`).set(bearer(alice.accessToken)).send(body);

    const replaced = await edit({ attachment_ids: [second.id, first.id] });
    const textOnly = await edit({ content: 'v2' });
    const cleared = await edit({ attachment_ids: [] });

    const ids = (res: typeof replaced) =>
      (res.body.data.attachments as FileBody[]).map((file) => file.id);
    expect(ids(replaced)).toEqual([second.id, first.id]);
    expect(ids(textOnly)).toEqual([second.id, first.id]);
    expect(ids(cleared)).toEqual([]);
  });

  it('sends files in chat to members only, and removes them with the message', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const dm = (
      await request(app)
        .post('/api/v1/conversations')
        .set(bearer(alice.accessToken))
        .send({ type: 'DIRECT', user_id: bob.user.id })
    ).body.data as { id: string };
    const photo = await uploadFile(alice.accessToken, PNG, 'image/png', 'photo.png');
    const report = await uploadFile(alice.accessToken, PDF, 'application/pdf', 'report.pdf');
    const send = (body: object) =>
      request(app)
        .post(`/api/v1/conversations/${dm.id}/messages`)
        .set(bearer(alice.accessToken))
        .send(body);

    const image = await send({ client_message_id: 'photo-message-1', attachment_ids: [photo.id] });
    const retry = await send({ client_message_id: 'photo-message-1', attachment_ids: [photo.id] });
    const mixed = await send({
      client_message_id: 'files-message-1',
      content: 'Ảnh và báo cáo',
      attachment_ids: [photo.id, report.id],
    });
    const empty = await send({ client_message_id: 'empty-message-1' });
    const asBob = await request(app)
      .get(`/api/v1/conversations/${dm.id}/messages`)
      .set(bearer(bob.accessToken));
    const asOwner = await request(app)
      .get(`/api/v1/conversations/${dm.id}/messages`)
      .set(bearer(owner.accessToken));

    expect(image.status).toBe(201);
    expect(image.body.data).toMatchObject({
      type: 'IMAGE',
      content: '',
      attachments: [{ id: photo.id, kind: 'image' }],
    });
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(image.body.data.id);
    expect(mixed.body.data.type).toBe('FILE');
    expect(empty.status).toBe(400);
    expect(empty.body.details[0].field).toBe('body.content');
    expect(asBob.body.data[0].attachments[0].url).toEqual(
      expect.stringContaining('memory://download/'),
    );
    // Organization admins can't read private conversations, attachments included (ADR-015).
    expect(asOwner.status).toBe(404);

    const deleted = await request(app)
      .delete(`/api/v1/conversations/${dm.id}/messages/${image.body.data.id}`)
      .set(bearer(alice.accessToken));

    expect(deleted.body.data).toMatchObject({ deleted: true, content: null, attachments: [] });
    expect(await prisma.messageAttachment.count({ where: { messageId: image.body.data.id } })).toBe(
      0,
    );
  });
});

describe('cleanup', () => {
  const service = (now: Date) =>
    new FileService({
      files: new PrismaFileRepository(prisma),
      storage,
      policy: { maxBytes: 1024 * 1024, maxPendingUploads: 5 },
      logger,
      now: () => now,
    });
  const later = (ms: number) => new Date(Date.now() + ms);
  const HOUR = 60 * 60 * 1000;

  it('fails abandoned uploads, then purges what nothing references - and nothing else', async () => {
    const { alice } = await createTeam(app);
    const abandoned = (
      await startUpload(alice.accessToken, {
        filename: 'a.png',
        content_type: 'image/png',
        size: PNG.length,
      })
    ).body.data as { file: FileBody; upload: { url: string } };
    // Uploaded, but never completed.
    storage.receiveUpload(abandoned.upload.url, PNG, 'image/png');
    const orphan = await uploadFile(alice.accessToken, PDF, 'application/pdf');
    const used = await uploadFile(alice.accessToken, PNG, 'image/png');
    await createPost(alice.accessToken, { content: 'uses a file', attachment_ids: [used.id] });
    const keyOf = async (id: string) =>
      (await prisma.file.findUniqueOrThrow({ where: { id }, select: { storageKey: true } }))
        .storageKey;
    const usedKey = await keyOf(used.id);

    const expired = await service(later(2 * HOUR)).cleanup();
    const statusAfterExpiry = await prisma.file.findUniqueOrThrow({
      where: { id: abandoned.file.id },
      select: { status: true },
    });
    const purged = await service(later(8 * 24 * HOUR)).cleanup();

    expect(expired).toEqual({ expired: 1, purged: 0 });
    expect(statusAfterExpiry.status).toBe('FAILED');
    expect(purged).toEqual({ expired: 0, purged: 2 });
    expect((await prisma.file.findMany({ select: { id: true } })).map((f) => f.id)).toEqual([
      used.id,
    ]);
    expect([...storage.objects.keys()]).toEqual([usedKey]);
    // The foreign key itself refuses to delete a referenced file (13: multiple references).
    expect(await new PrismaFileRepository(prisma).deleteUnreferenced(used.id)).toBe(false);
    expect(orphan.status).toBe('READY');
  });
});
