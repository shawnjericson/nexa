import { compare } from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

/**
 * The exam's own requirements (docs/specs/NodeJS.docx), checked the way the exam checks them:
 * through the /api/* routes (ADR-010), with exactly the payloads the SRS lists and nothing NEXA
 * adds - no organization header, no display name. Each describe block is one section of the SRS.
 * The rest of the suite tests NEXA; this file answers "does it pass the exam?".
 */
const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

let sequence = 0;
async function account(password = 'secret123') {
  sequence += 1;
  const username = `srs_user_${Date.now().toString(36)}${sequence}`;
  const email = `${username}@example.com`;
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password });
  const loggedIn = await request(app).post('/api/auth/login').send({ email, password });
  return {
    id: registered.body.data.id as string,
    username,
    email,
    token: loggedIn.body.data.access_token as string,
  };
}

async function postBy(token: string, body: object = { content: 'Hello', image_url: null }) {
  const res = await request(app).post('/api/posts').set(bearer(token)).send(body);
  return res.body.data as { id: string };
}

describe('SRS 2 - data model', () => {
  it('User has id, username, email, avatar and created_at, and a bcrypt-hashed password', async () => {
    const alice = await account('secret123');
    await request(app)
      .put('/api/users/me')
      .set(bearer(alice.token))
      .send({ avatar: 'https://example.com/alice.png' });

    const me = (await request(app).get('/api/users/me').set(bearer(alice.token))).body.data;
    expect(me).toMatchObject({
      id: alice.id,
      username: alice.username,
      email: alice.email,
      avatar: 'https://example.com/alice.png',
      created_at: expect.any(String),
    });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await compare('secret123', stored.passwordHash)).toBe(true);
  });

  it('Post has id, user_id, content, image_url, created_at and updated_at', async () => {
    const alice = await account();
    const created = await request(app)
      .post('/api/posts')
      .set(bearer(alice.token))
      .send({ content: 'First post', image_url: 'https://example.com/a.png' });

    expect(created.body.data).toMatchObject({
      id: expect.any(String),
      user_id: alice.id,
      content: 'First post',
      image_url: 'https://example.com/a.png',
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('Comment has id, post_id, user_id, content and created_at', async () => {
    const alice = await account();
    const post = await postBy(alice.token);
    const created = await request(app)
      .post(`/api/comments/post/${post.id}`)
      .set(bearer(alice.token))
      .send({ content: 'Nice' });

    expect(created.body.data).toMatchObject({
      id: expect.any(String),
      post_id: post.id,
      user_id: alice.id,
      content: 'Nice',
      created_at: expect.any(String),
    });
  });
});

describe('SRS 3.1 - /api/auth', () => {
  it('POST /register takes username, email and password and returns the user without the password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'srs_register', email: 'register@example.com', password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      username: 'srs_register',
      email: 'register@example.com',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|secret123|\$2[aby]\$/);
  });

  it('POST /login takes email and password and returns an access_token (a JWT)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'srs_login', email: 'login@example.com', password: 'secret123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    const [header] = (res.body.data.access_token as string).split('.');
    expect(res.body.data.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString())).toMatchObject({
      alg: 'HS256',
    });
  });

  it('refuses a wrong password', async () => {
    const alice = await account('secret123');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: alice.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });
});

describe('SRS 3.2 - /api/users', () => {
  it('GET /me returns the profile of the signed-in user', async () => {
    const alice = await account();
    const res = await request(app).get('/api/users/me').set(bearer(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: alice.id, username: alice.username });
  });

  it('GET /:id returns the profile of any user', async () => {
    const alice = await account();
    const bob = await account();
    const res = await request(app).get(`/api/users/${bob.id}`).set(bearer(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: bob.id, username: bob.username });
  });

  it('PUT /me updates the avatar and the username', async () => {
    const alice = await account();
    const res = await request(app)
      .put('/api/users/me')
      .set(bearer(alice.token))
      .send({ avatar: 'https://example.com/new.png', username: 'srs_renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      username: 'srs_renamed',
      avatar: 'https://example.com/new.png',
    });
  });
});

describe('SRS 3.3 - /api/posts', () => {
  it('POST / creates a post from content and image_url', async () => {
    const alice = await account();
    const res = await request(app)
      .post('/api/posts')
      .set(bearer(alice.token))
      .send({ content: 'Hello world', image_url: 'https://example.com/p.png' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      content: 'Hello world',
      image_url: 'https://example.com/p.png',
    });
  });

  it('GET / is the feed, paginated with page and limit', async () => {
    const alice = await account();
    for (const n of [1, 2, 3]) await postBy(alice.token, { content: `Post ${n}` });

    const first = await request(app)
      .get('/api/posts')
      .query({ page: 1, limit: 2 })
      .set(bearer(alice.token));
    const second = await request(app)
      .get('/api/posts')
      .query({ page: 2, limit: 2 })
      .set(bearer(alice.token));

    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(second.body.data).toHaveLength(1);
    expect(first.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3 });
  });

  it('GET /:id returns one post together with its author', async () => {
    const alice = await account();
    const post = await postBy(alice.token, { content: 'Details' });
    const res = await request(app).get(`/api/posts/${post.id}`).set(bearer(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: post.id,
      content: 'Details',
      author: { id: alice.id, username: alice.username },
    });
  });

  it('PUT /:id updates content and image_url, for the author only', async () => {
    const alice = await account();
    const bob = await account();
    const post = await postBy(alice.token);

    const byBob = await request(app)
      .put(`/api/posts/${post.id}`)
      .set(bearer(bob.token))
      .send({ content: 'Hijacked', image_url: null });
    const byAlice = await request(app)
      .put(`/api/posts/${post.id}`)
      .set(bearer(alice.token))
      .send({ content: 'Edited', image_url: 'https://example.com/e.png' });

    expect(byBob.status).toBe(403);
    expect(byAlice.status).toBe(200);
    expect(byAlice.body.data).toMatchObject({
      content: 'Edited',
      image_url: 'https://example.com/e.png',
    });
  });

  it('DELETE /:id deletes, for the author only - even the first user to register cannot', async () => {
    // The first registrant owns the default organization (ADR-010); the exam still says author only.
    const first = await account();
    const alice = await account();
    const post = await postBy(alice.token);

    const byFirst = await request(app).delete(`/api/posts/${post.id}`).set(bearer(first.token));
    const byAlice = await request(app).delete(`/api/posts/${post.id}`).set(bearer(alice.token));
    const after = await request(app).get(`/api/posts/${post.id}`).set(bearer(alice.token));

    expect(byFirst.status).toBe(403);
    expect([200, 204]).toContain(byAlice.status);
    expect(after.status).toBe(404);
  });
});

describe('SRS 3.4 - /api/comments', () => {
  it('POST /post/:postId adds a comment and GET /post/:postId lists them', async () => {
    const alice = await account();
    const bob = await account();
    const post = await postBy(alice.token);

    const added = await request(app)
      .post(`/api/comments/post/${post.id}`)
      .set(bearer(bob.token))
      .send({ content: 'Great post' });
    const listed = await request(app).get(`/api/comments/post/${post.id}`).set(bearer(alice.token));

    expect(added.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({ content: 'Great post', post_id: post.id }),
    ]);
  });

  it('DELETE /:id deletes, for the author only - even the first user to register cannot', async () => {
    const first = await account();
    const alice = await account();
    const post = await postBy(alice.token);
    const comment = (
      await request(app)
        .post(`/api/comments/post/${post.id}`)
        .set(bearer(alice.token))
        .send({ content: 'Mine' })
    ).body.data as { id: string };

    const byFirst = await request(app)
      .delete(`/api/comments/${comment.id}`)
      .set(bearer(first.token));
    const byAlice = await request(app)
      .delete(`/api/comments/${comment.id}`)
      .set(bearer(alice.token));

    expect(byFirst.status).toBe(403);
    expect([200, 204]).toContain(byAlice.status);
  });
});

describe('SRS 4 - technical constraints', () => {
  it('protects every route except auth with the JWT middleware', async () => {
    const alice = await account();
    const post = await postBy(alice.token);
    const id = post.id;
    const routes: Array<[method: 'get' | 'post' | 'put' | 'delete', path: string]> = [
      ['get', '/api/users/me'],
      ['get', `/api/users/${alice.id}`],
      ['put', '/api/users/me'],
      ['get', '/api/posts'],
      ['get', `/api/posts/${id}`],
      ['post', '/api/posts'],
      ['put', `/api/posts/${id}`],
      ['delete', `/api/posts/${id}`],
      ['get', `/api/comments/post/${id}`],
      ['post', `/api/comments/post/${id}`],
      ['delete', `/api/comments/${id}`],
    ];

    for (const [method, path] of routes) {
      const call = (agent: ReturnType<typeof request>) => agent[method](path);
      const missing = await call(request(app)).send({ content: 'x' });
      const forged = await call(request(app))
        .set({ Authorization: 'Bearer not.a.token' })
        .send({ content: 'x' });
      expect([path, missing.status]).toEqual([path, 401]);
      expect([path, forged.status]).toEqual([path, 401]);
    }
  });

  it('validates input: a real e-mail address and a password of at least 6 characters', async () => {
    const badEmail = await request(app)
      .post('/api/auth/register')
      .send({ username: 'srs_bad_email', email: 'not-an-email', password: 'secret123' });
    const shortPassword = await request(app)
      .post('/api/auth/register')
      .send({ username: 'srs_short', email: 'short@example.com', password: '12345' });
    const sixCharacters = await request(app)
      .post('/api/auth/register')
      .send({ username: 'srs_six', email: 'six@example.com', password: '123456' });

    expect(badEmail.status).toBe(400);
    expect(shortPassword.status).toBe(400);
    expect(sixCharacters.status).toBe(201);
  });

  it('answers every error through one handler, as { "error": "message", "status": code }', async () => {
    const alice = await account();
    const errors = await Promise.all([
      request(app).post('/api/auth/register').send({ email: 'x' }),
      request(app).get('/api/users/me'),
      request(app).get('/api/posts/00000000-0000-7000-8000-000000000000').set(bearer(alice.token)),
      request(app).get('/api/no-such-route').set(bearer(alice.token)),
    ]);

    for (const res of errors) {
      expect(res.body).toMatchObject({ error: expect.any(String), status: res.status });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(errors.map((res) => res.status)).toEqual([400, 401, 404, 404]);
  });
});
