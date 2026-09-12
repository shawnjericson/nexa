import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam, moveToNewOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createPost(token: string, content = 'A post') {
  const res = await request(app).post('/api/v1/posts').set(bearer(token)).send({ content });
  return res.body.data as { id: string };
}

const comment = (token: string, postId: string, body: { content: string; parent_id?: string }) =>
  request(app).post(`/api/v1/posts/${postId}/comments`).set(bearer(token)).send(body);

const listComments = (token: string, postId: string, query: Record<string, string | number> = {}) =>
  request(app).get(`/api/v1/posts/${postId}/comments`).query(query).set(bearer(token));

const contents = (res: request.Response) =>
  res.body.data.map((c: { content: string }) => c.content) as string[];

describe('comments', () => {
  it('lists comments oldest first with their authors and counts them on the post', async () => {
    const { alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);

    const first = await comment(bob.accessToken, post.id, { content: 'first' });
    await comment(alice.accessToken, post.id, { content: 'second' });
    const list = await listComments(alice.accessToken, post.id);
    const reloaded = await request(app)
      .get(`/api/v1/posts/${post.id}`)
      .set(bearer(bob.accessToken));

    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      post_id: post.id,
      parent_id: null,
      author: { id: bob.user.id },
      can_delete: true,
    });
    expect(contents(list)).toEqual(['first', 'second']);
    expect(list.body.data[0].can_delete).toBe(false); // bob's comment, seen by alice
    expect(reloaded.body.data.comment_count).toBe(2);
  });

  it('keeps replies one level deep by attaching replies-to-replies to the thread root', async () => {
    const { alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    const root = (await comment(alice.accessToken, post.id, { content: 'root' })).body.data;

    const reply = await comment(bob.accessToken, post.id, { content: 'reply', parent_id: root.id });
    const nested = await comment(alice.accessToken, post.id, {
      content: 'reply to reply',
      parent_id: reply.body.data.id,
    });

    expect(reply.body.data.parent_id).toBe(root.id);
    expect(nested.body.data.parent_id).toBe(root.id);
  });

  it('rejects a parent comment that belongs to another post', async () => {
    const { alice } = await createTeam(app);
    const postA = await createPost(alice.accessToken, 'A');
    const postB = await createPost(alice.accessToken, 'B');
    const onB = (await comment(alice.accessToken, postB.id, { content: 'on B' })).body.data;

    const res = await comment(alice.accessToken, postA.id, { content: 'x', parent_id: onB.id });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PARENT_COMMENT_NOT_FOUND');
  });

  it('refuses comments on deleted posts and on posts of other organizations', async () => {
    const { alice } = await createTeam(app);
    const deleted = await createPost(alice.accessToken, 'to delete');
    await request(app).delete(`/api/v1/posts/${deleted.id}`).set(bearer(alice.accessToken));
    const visible = await createPost(alice.accessToken, 'visible');
    const mallory = await registerAndLogin(app);
    await moveToNewOrganization(mallory.user.id, 'rival-company');

    const onDeleted = await comment(alice.accessToken, deleted.id, { content: 'hello?' });
    const crossTenant = await comment(mallory.accessToken, visible.id, { content: 'hi' });
    const crossTenantList = await listComments(mallory.accessToken, visible.id);

    for (const res of [onDeleted, crossTenant, crossTenantList]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    }
  });

  it('lets the author or a moderator delete a comment, together with its replies', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    const root = (await comment(bob.accessToken, post.id, { content: 'root' })).body.data;
    await comment(alice.accessToken, post.id, { content: 'reply', parent_id: root.id });

    const byMember = await request(app)
      .delete(`/api/v1/comments/${root.id}`)
      .set(bearer(alice.accessToken));
    const byModerator = await request(app)
      .delete(`/api/v1/comments/${root.id}`)
      .set(bearer(owner.accessToken));

    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe('COMMENT_DELETE_FORBIDDEN');
    expect(byModerator.status).toBe(200);
    expect(contents(await listComments(alice.accessToken, post.id))).toEqual([]);
    const reloaded = await request(app)
      .get(`/api/v1/posts/${post.id}`)
      .set(bearer(bob.accessToken));
    expect(reloaded.body.data.comment_count).toBe(0);
  });

  it('makes comments unreachable once their post is deleted', async () => {
    const { alice } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    const own = (await comment(alice.accessToken, post.id, { content: 'mine' })).body.data;
    await request(app).delete(`/api/v1/posts/${post.id}`).set(bearer(alice.accessToken));

    const res = await request(app)
      .delete(`/api/v1/comments/${own.id}`)
      .set(bearer(alice.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COMMENT_NOT_FOUND');
  });

  it('paginates comments with a cursor', async () => {
    const { alice } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    for (const text of ['c1', 'c2', 'c3'])
      await comment(alice.accessToken, post.id, { content: text });

    const page1 = await listComments(alice.accessToken, post.id, { limit: 2 });
    const page2 = await listComments(alice.accessToken, post.id, {
      limit: 2,
      cursor: page1.body.pagination.next_cursor,
    });

    expect(contents(page1)).toEqual(['c1', 'c2']);
    expect(page1.body.pagination.has_next).toBe(true);
    expect(contents(page2)).toEqual(['c3']);
    expect(page2.body.pagination.has_next).toBe(false);
  });
});

describe('exam contract: /api/comments', () => {
  it('creates, lists and deletes comments with owner-only deletion', async () => {
    const { alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);

    const created = await request(app)
      .post(`/api/comments/post/${post.id}`)
      .set(bearer(alice.accessToken))
      .send({ content: 'Exam comment' });
    const list = await request(app)
      .get(`/api/comments/post/${post.id}`)
      .set(bearer(bob.accessToken));
    const forbidden = await request(app)
      .delete(`/api/comments/${created.body.data.id}`)
      .set(bearer(bob.accessToken));
    const removed = await request(app)
      .delete(`/api/comments/${created.body.data.id}`)
      .set(bearer(alice.accessToken));

    expect(created.status).toBe(201);
    expect(contents(list)).toEqual(['Exam comment']);
    expect(list.body.pagination).toMatchObject({ page: 1, total: 1, has_next: false });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({ status: 403, error: expect.any(String) });
    expect(removed.status).toBe(200);
  });
});
