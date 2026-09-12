import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam, moveToNewOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const NONE = { LIKE: 0, LOVE: 0, HAHA: 0, CELEBRATE: 0, SAD: 0 };

async function createPost(token: string) {
  const res = await request(app)
    .post('/api/v1/posts')
    .set(bearer(token))
    .send({ content: 'React to me' });
  return res.body.data as { id: string };
}

const react = (token: string, postId: string, type: string) =>
  request(app).post(`/api/v1/posts/${postId}/reactions`).set(bearer(token)).send({ type });

const unreact = (token: string, postId: string) =>
  request(app).delete(`/api/v1/posts/${postId}/reactions`).set(bearer(token));

describe('reactions', () => {
  it('keeps one reaction per person and lets them change it', async () => {
    const { alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);

    const liked = await react(bob.accessToken, post.id, 'LIKE');
    const loved = await react(bob.accessToken, post.id, 'LOVE');

    expect(liked.status).toBe(200);
    expect(liked.body.data).toEqual({
      total: 1,
      counts: { ...NONE, LIKE: 1 },
      viewer_reaction: 'LIKE',
    });
    expect(loved.body.data).toEqual({
      total: 1,
      counts: { ...NONE, LOVE: 1 },
      viewer_reaction: 'LOVE',
    });
    expect(await prisma.reaction.count()).toBe(1);
  });

  it('stores a single reaction when the same reaction arrives concurrently (7.2)', async () => {
    const { alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => react(bob.accessToken, post.id, 'LIKE')),
    );

    expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    expect(await prisma.reaction.count({ where: { postId: post.id } })).toBe(1);
  });

  it('shows totals to everyone and each viewer their own reaction, in posts and the feed', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    await react(bob.accessToken, post.id, 'LIKE');
    await react(owner.accessToken, post.id, 'CELEBRATE');

    const asAlice = await request(app)
      .get(`/api/v1/posts/${post.id}`)
      .set(bearer(alice.accessToken));
    const asBob = await request(app).get('/api/v1/feed').set(bearer(bob.accessToken));

    expect(asAlice.body.data.reactions).toEqual({
      total: 2,
      counts: { ...NONE, LIKE: 1, CELEBRATE: 1 },
      viewer_reaction: null,
    });
    expect(asBob.body.data[0].reactions.viewer_reaction).toBe('LIKE');
  });

  it('removes a reaction, idempotently', async () => {
    const { alice, bob } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    await react(bob.accessToken, post.id, 'HAHA');

    const first = await unreact(bob.accessToken, post.id);
    const second = await unreact(bob.accessToken, post.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ total: 0, counts: NONE, viewer_reaction: null });
  });

  it('rejects unknown reaction types and posts outside the organization', async () => {
    const { alice } = await createTeam(app);
    const post = await createPost(alice.accessToken);
    const mallory = await registerAndLogin(app);
    await moveToNewOrganization(mallory.user.id, 'rival-company');

    const unknownType = await react(alice.accessToken, post.id, 'ANGRY');
    const foreign = await react(mallory.accessToken, post.id, 'LIKE');

    expect(unknownType.status).toBe(400);
    expect(unknownType.body.details[0].field).toBe('body.type');
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('POST_NOT_FOUND');
  });
});
