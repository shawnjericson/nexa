import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, login, registerAndLogin, registerUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('GET /api/v1/users/me', () => {
  it('returns the current profile without any password data', async () => {
    const session = await registerAndLogin(app);

    const res = await request(app).get('/api/v1/users/me').set(bearer(session.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: session.user.id,
      email: session.input.email,
      username: session.input.username,
    });
    expect(res.body.data.last_login_at).not.toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('PUT /api/v1/users/me', () => {
  it('updates username, display name, bio and avatar', async () => {
    const session = await registerAndLogin(app);
    const changes = {
      username: `renamed_${Date.now().toString(36)}`,
      display_name: 'Tên Mới',
      bio: 'Backend engineer',
      avatar_url: 'https://cdn.nexa.io/avatars/me.png',
    };

    const res = await request(app)
      .put('/api/v1/users/me')
      .set(bearer(session.accessToken))
      .send(changes);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject(changes);
  });

  it('accepts the exam field name "avatar" on the exam route', async () => {
    const session = await registerAndLogin(app);

    const res = await request(app)
      .put('/api/users/me')
      .set(bearer(session.accessToken))
      .send({ avatar: 'https://cdn.nexa.io/avatars/exam.png' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatar_url).toBe('https://cdn.nexa.io/avatars/exam.png');
  });

  it('ignores fields that cannot be changed through this endpoint', async () => {
    const session = await registerAndLogin(app);

    const res = await request(app).put('/api/v1/users/me').set(bearer(session.accessToken)).send({
      display_name: 'Still Me',
      email: 'attacker@nexa.test',
      password: 'hijacked-1',
      status: 'DEACTIVATED',
    });

    expect(res.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    expect(stored).toMatchObject({
      email: session.input.email,
      status: 'ACTIVE',
      displayName: 'Still Me',
    });
    await login(app, session.input.email, session.input.password);
  });

  it('rejects a username that belongs to someone else', async () => {
    const other = await registerUser(app);
    const session = await registerAndLogin(app);

    const res = await request(app)
      .put('/api/v1/users/me')
      .set(bearer(session.accessToken))
      .send({ username: other.input.username });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('rejects empty updates and non-http avatar URLs', async () => {
    const session = await registerAndLogin(app);

    const empty = await request(app)
      .put('/api/v1/users/me')
      .set(bearer(session.accessToken))
      .send({});
    const script = await request(app)
      .put('/api/v1/users/me')
      .set(bearer(session.accessToken))
      .send({ avatar_url: 'javascript:alert(1)' });

    expect(empty.status).toBe(400);
    expect(script.status).toBe(400);
    expect(script.body.details[0].field).toBe('body.avatar_url');
  });
});

describe('GET /api/v1/users/:id', () => {
  it('shows the profile of a coworker in a shared organization', async () => {
    const coworker = await registerUser(app);
    const session = await registerAndLogin(app);

    const res = await request(app)
      .get(`/api/v1/users/${coworker.user.id}`)
      .set(bearer(session.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: coworker.user.id,
      username: coworker.input.username,
    });
    expect(res.body.data).not.toHaveProperty('last_login_at');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('answers 404 for users outside your organizations, exactly like a missing id', async () => {
    const outsider = await registerUser(app);
    await prisma.organizationMember.deleteMany({ where: { userId: outsider.user.id } });
    const session = await registerAndLogin(app);

    const hidden = await request(app)
      .get(`/api/v1/users/${outsider.user.id}`)
      .set(bearer(session.accessToken));
    const missing = await request(app)
      .get('/api/v1/users/0190f5a4-0000-7000-8000-000000000000')
      .set(bearer(session.accessToken));

    for (const res of [hidden, missing]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'USER_NOT_FOUND', error: 'User not found' });
    }
  });

  it('validates the id format', async () => {
    const session = await registerAndLogin(app);

    const res = await request(app).get('/api/v1/users/not-a-uuid').set(bearer(session.accessToken));

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('params.id');
  });
});
