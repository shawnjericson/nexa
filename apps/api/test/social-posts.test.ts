import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createOrganization, createTeam, moveToNewOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

type PostBody = {
  content?: string;
  image_url?: string | null;
  type?: string;
  [key: string]: unknown;
};

const createPost = (token: string, body: PostBody = { content: 'Hello NEXA' }) =>
  request(app).post('/api/v1/posts').set(bearer(token)).send(body);

const getPost = (token: string, id: string) =>
  request(app).get(`/api/v1/posts/${id}`).set(bearer(token));

const getFeed = (token: string, query: Record<string, string | number> = {}) =>
  request(app).get('/api/v1/feed').query(query).set(bearer(token));

async function defaultOrganizationId() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'nexa-test' },
  });
  return organization.id;
}

describe('POST /api/v1/posts', () => {
  it("creates a post in the caller's organization with author info and UI permissions", async () => {
    const { alice } = await createTeam(app);

    const res = await createPost(alice.accessToken, {
      content: '  Xin chào cả team!  ',
      image_url: 'https://cdn.nexa.io/posts/1.png',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      organization_id: await defaultOrganizationId(),
      content: 'Xin chào cả team!',
      image_url: 'https://cdn.nexa.io/posts/1.png',
      type: 'GENERAL',
      visibility: 'ORGANIZATION',
      comment_count: 0,
      can_edit: true,
      can_delete: true,
      author: { id: alice.user.id, username: alice.input.username, deactivated: false },
    });
  });

  it('never trusts an organization_id sent by the client', async () => {
    const { alice } = await createTeam(app);
    const foreign = await createOrganization('someone-else');

    const res = await createPost(alice.accessToken, {
      content: 'Sneaky',
      organization_id: foreign.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.organization_id).toBe(await defaultOrganizationId());
    expect(await prisma.post.count({ where: { organizationId: foreign.id } })).toBe(0);
  });

  it('validates content and image_url', async () => {
    const { alice } = await createTeam(app);

    const blank = await createPost(alice.accessToken, { content: '   ' });
    const badImage = await createPost(alice.accessToken, { content: 'x', image_url: 'ftp://x/y' });

    expect(blank.status).toBe(400);
    expect(blank.body.details[0].field).toBe('body.content');
    expect(badImage.status).toBe(400);
    expect(badImage.body.details[0].field).toBe('body.image_url');
  });

  it('lets only members with announcement.publish post announcements', async () => {
    const { owner, alice } = await createTeam(app);

    const byMember = await createPost(alice.accessToken, { content: 'News', type: 'ANNOUNCEMENT' });
    const byOwner = await createPost(owner.accessToken, { content: 'News', type: 'ANNOUNCEMENT' });

    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe('ANNOUNCEMENT_FORBIDDEN');
    expect(byOwner.status).toBe(201);
    expect(byOwner.body.data.type).toBe('ANNOUNCEMENT');
  });
});

describe('GET /api/v1/posts/:id', () => {
  it('returns the post with UI permissions computed for the viewer', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;

    const asBob = await getPost(bob.accessToken, post.id);
    const asOwner = await getPost(owner.accessToken, post.id);

    expect(asBob.status).toBe(200);
    expect(asBob.body.data).toMatchObject({
      id: post.id,
      author: { id: alice.user.id },
      can_edit: false,
      can_delete: false,
    });
    // The owner holds post.moderate: may delete, but still may not edit someone else's post.
    expect(asOwner.body.data).toMatchObject({ can_edit: false, can_delete: true });
  });

  it('hides posts of other organizations as 404 for reads and writes alike', async () => {
    const { alice } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;
    const mallory = await registerAndLogin(app);
    await moveToNewOrganization(mallory.user.id, 'rival-company');

    const read = await getPost(mallory.accessToken, post.id);
    const update = await request(app)
      .put(`/api/v1/posts/${post.id}`)
      .set(bearer(mallory.accessToken))
      .send({ content: 'hacked' });
    const remove = await request(app)
      .delete(`/api/v1/posts/${post.id}`)
      .set(bearer(mallory.accessToken));

    for (const res of [read, update, remove]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    }
    const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored).toMatchObject({ content: 'Hello NEXA', deletedAt: null });
  });
});

describe('PUT /api/v1/posts/:id', () => {
  it('lets the author edit content and image', async () => {
    const { alice } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;

    const res = await request(app)
      .put(`/api/v1/posts/${post.id}`)
      .set(bearer(alice.accessToken))
      .send({ content: 'Edited', image_url: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ content: 'Edited', image_url: null });
  });

  it('forbids everyone else, moderators included', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;

    for (const intruder of [bob, owner]) {
      const res = await request(app)
        .put(`/api/v1/posts/${post.id}`)
        .set(bearer(intruder.accessToken))
        .send({ content: 'Not yours' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('POST_EDIT_FORBIDDEN');
    }
    const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored.content).toBe('Hello NEXA');
  });
});

describe('DELETE /api/v1/posts/:id', () => {
  it('soft-deletes: the post disappears from reads and the feed but stays in the database', async () => {
    const { alice } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;

    const res = await request(app)
      .delete(`/api/v1/posts/${post.id}`)
      .set(bearer(alice.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: post.id, deleted: true });
    expect((await getPost(alice.accessToken, post.id)).status).toBe(404);
    expect((await getFeed(alice.accessToken)).body.data).toEqual([]);
    const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored.deletedAt).not.toBeNull();
  });

  it('lets a moderator delete but not a plain member', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;

    const byMember = await request(app)
      .delete(`/api/v1/posts/${post.id}`)
      .set(bearer(bob.accessToken));
    const byModerator = await request(app)
      .delete(`/api/v1/posts/${post.id}`)
      .set(bearer(owner.accessToken));

    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe('POST_DELETE_FORBIDDEN');
    expect(byModerator.status).toBe(200);
  });

  it('answers 404 when the post is already deleted', async () => {
    const { alice } = await createTeam(app);
    const post = (await createPost(alice.accessToken)).body.data;
    await request(app).delete(`/api/v1/posts/${post.id}`).set(bearer(alice.accessToken));

    const again = await request(app)
      .delete(`/api/v1/posts/${post.id}`)
      .set(bearer(alice.accessToken));

    expect(again.status).toBe(404);
  });
});

describe('GET /api/v1/feed', () => {
  it('pages newest first with a cursor that survives new and deleted posts', async () => {
    const { alice } = await createTeam(app);
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4, 5]) {
      ids.push((await createPost(alice.accessToken, { content: `post ${n}` })).body.data.id);
    }

    const page1 = await getFeed(alice.accessToken, { limit: 2 });
    expect(page1.body.data.map((p: { content: string }) => p.content)).toEqual([
      'post 5',
      'post 4',
    ]);
    expect(page1.body.pagination).toMatchObject({ has_next: true, limit: 2 });

    // A post arriving mid-scroll must not shift or duplicate later pages (risk register 8.1),
    // and an item deleted inside the window is simply skipped (8.3).
    await createPost(alice.accessToken, { content: 'post 6' });
    await request(app).delete(`/api/v1/posts/${ids[2]}`).set(bearer(alice.accessToken));

    const page2 = await getFeed(alice.accessToken, {
      limit: 2,
      cursor: page1.body.pagination.next_cursor,
    });
    expect(page2.body.data.map((p: { content: string }) => p.content)).toEqual([
      'post 2',
      'post 1',
    ]);
    expect(page2.body.pagination).toEqual({ next_cursor: null, has_next: false, limit: 2 });
  });

  it('rejects tampered cursors', async () => {
    const { alice } = await createTeam(app);
    const forged = Buffer.from(JSON.stringify({ t: 'yesterday', id: 'x' })).toString('base64url');

    for (const cursor of ['garbage', forged]) {
      const res = await getFeed(alice.accessToken, { cursor });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    }
  });

  it("only contains the caller's organization", async () => {
    const { alice } = await createTeam(app);
    await createPost(alice.accessToken, { content: 'inside' });
    const mallory = await registerAndLogin(app);
    await moveToNewOrganization(mallory.user.id, 'rival-company');
    await createPost(mallory.accessToken, { content: 'outside' });

    const aliceFeed = await getFeed(alice.accessToken);
    const malloryFeed = await getFeed(mallory.accessToken);

    expect(aliceFeed.body.data.map((p: { content: string }) => p.content)).toEqual(['inside']);
    expect(malloryFeed.body.data.map((p: { content: string }) => p.content)).toEqual(['outside']);
  });
});

describe('exam contract: /api/posts', () => {
  it('paginates with page and limit', async () => {
    const { alice } = await createTeam(app);
    for (const n of [1, 2, 3]) await createPost(alice.accessToken, { content: `post ${n}` });

    const res = await request(app)
      .get('/api/posts')
      .query({ page: 2, limit: 2 })
      .set(bearer(alice.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { content: string }) => p.content)).toEqual(['post 1']);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      total_pages: 2,
      has_next: false,
    });
  });

  it('supports the full CRUD flow with owner-only mutations and exam-style errors', async () => {
    const { alice, bob } = await createTeam(app);

    const created = await request(app)
      .post('/api/posts')
      .set(bearer(alice.accessToken))
      .send({ content: 'Exam post', image_url: 'https://cdn.nexa.io/e.png' });
    const id = created.body.data.id;
    const read = await request(app).get(`/api/posts/${id}`).set(bearer(bob.accessToken));
    const forbidden = await request(app)
      .put(`/api/posts/${id}`)
      .set(bearer(bob.accessToken))
      .send({ content: 'Mine now' });
    const updated = await request(app)
      .put(`/api/posts/${id}`)
      .set(bearer(alice.accessToken))
      .send({ content: 'Exam post (edited)' });
    const removed = await request(app).delete(`/api/posts/${id}`).set(bearer(alice.accessToken));
    const gone = await request(app).get(`/api/posts/${id}`).set(bearer(alice.accessToken));

    expect(created.status).toBe(201);
    expect(read.status).toBe(200);
    expect(read.body.data.author.id).toBe(alice.user.id);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({
      status: 403,
      error: 'Only the author can edit this post',
    });
    expect(updated.body.data.content).toBe('Exam post (edited)');
    expect(removed.status).toBe(200);
    expect(gone.status).toBe(404);
    expect(gone.body).toMatchObject({ status: 404, error: 'Post not found' });
  });
});
