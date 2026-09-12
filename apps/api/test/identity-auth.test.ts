import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../src/modules/identity/infrastructure/jwt-access-token.service';
import {
  bearer,
  login,
  newUserInput,
  registerAndLogin,
  registerUser,
  UUID_V7,
} from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const refresh = (refreshToken: string) =>
  request(app).post('/api/v1/auth/refresh').send({ refresh_token: refreshToken });

function expectNoPasswordFields(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(/password/i);
}

describe('POST /api/v1/auth/register', () => {
  it('creates the account and never exposes the password hash', async () => {
    const input = newUserInput({ display_name: 'An Nguyễn' });

    const res = await request(app).post('/api/v1/auth/register').send(input);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: input.email,
      username: input.username,
      display_name: 'An Nguyễn',
      avatar_url: null,
      status: 'ACTIVE',
    });
    expect(res.body.data.id).toMatch(UUID_V7);
    expectNoPasswordFields(res.body);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toContain(input.password);
  });

  it('normalizes the email and defaults display_name to the username', async () => {
    const input = newUserInput();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...input, email: `  ${input.email.toUpperCase()} ` });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe(input.email);
    expect(res.body.data.display_name).toBe(input.username);
  });

  it('makes the first user OWNER and later users MEMBER of the default organization', async () => {
    const first = await registerUser(app);
    const second = await registerUser(app);

    const memberships = await prisma.organizationMember.findMany({
      include: { role: true, organization: true },
    });
    const summary = memberships.map((m) => [m.userId, m.role.key, m.organization.slug]);
    expect(summary).toHaveLength(2);
    expect(summary).toEqual(
      expect.arrayContaining([
        [first.user.id, 'OWNER', 'nexa-test'],
        [second.user.id, 'MEMBER', 'nexa-test'],
      ]),
    );
  });

  it('rejects an email that is already registered, ignoring case', async () => {
    const { input } = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(newUserInput({ email: input.email.toUpperCase() }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, status: 409, code: 'EMAIL_TAKEN' });
  });

  it('rejects a username that is already taken, ignoring case', async () => {
    const { input } = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(newUserInput({ username: input.username.toUpperCase() }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('creates exactly one account when identical registrations race', async () => {
    const input = newUserInput();

    const results = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/v1/auth/register').send(input)),
    );

    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.user.count({ where: { email: input.email } })).toBe(1);
  });

  it('validates input: username rules, email format, password of at least 6 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'a!', email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.map((issue: { field: string }) => issue.field)).toEqual(
      expect.arrayContaining(['body.username', 'body.email', 'body.password']),
    );
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns an access token, a refresh token and the profile', async () => {
    const { input } = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      token_type: 'Bearer',
      expires_in: 900,
      user: { email: input.email },
    });
    expect(res.body.data.access_token.split('.')).toHaveLength(3);
    expect(res.body.data.refresh_token).toMatch(/^[\w-]{43}$/);
    expect(res.body.data.user.last_login_at).not.toBeNull();
    expectNoPasswordFields(res.body.data.user);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { input } = await registerUser(app);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@nexa.test', password: 'whatever1' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid email or password',
      });
    }
  });

  it('rejects deactivated accounts', async () => {
    const { input, user } = await registerUser(app);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DEACTIVATED' } });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DEACTIVATED');
  });
});

describe('refresh token rotation', () => {
  it('issues a new token pair and stores only token hashes', async () => {
    const session = await registerAndLogin(app);

    const res = await refresh(session.refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.data.refresh_token).not.toBe(session.refreshToken);
    const me = await request(app).get('/api/v1/users/me').set(bearer(res.body.data.access_token));
    expect(me.status).toBe(200);

    const rows = await prisma.refreshToken.findMany({ where: { userId: session.user.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.familyId)).size).toBe(1);
    for (const row of rows) {
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect([session.refreshToken, res.body.data.refresh_token]).not.toContain(row.tokenHash);
    }
  });

  it('revokes the whole session when a rotated token is replayed', async () => {
    const session = await registerAndLogin(app);
    const rotated = await refresh(session.refreshToken);
    expect(rotated.status).toBe(200);

    const replay = await refresh(session.refreshToken);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate successor dies with the session.
    const successor = await refresh(rotated.body.data.refresh_token);
    expect(successor.status).toBe(401);
    expect(successor.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects expired and unknown refresh tokens', async () => {
    const session = await registerAndLogin(app);
    await prisma.refreshToken.updateMany({
      where: { userId: session.user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const expired = await refresh(session.refreshToken);
    const unknown = await refresh('this-token-was-never-issued');

    for (const res of [expired, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    }
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('ends the session and is idempotent', async () => {
    const session = await registerAndLogin(app);

    const first = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: session.refreshToken });
    const second = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: session.refreshToken });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    const res = await refresh(session.refreshToken);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /api/v1/auth/change-password', () => {
  it('requires the current password', async () => {
    const session = await registerAndLogin(app);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ current_password: 'not-my-password', new_password: 'brand-new-1' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('changes the password and signs out every other session', async () => {
    const session = await registerAndLogin(app);
    const otherDevice = await login(app, session.input.email, session.input.password);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set(bearer(session.accessToken))
      .send({ current_password: session.input.password, new_password: 'brand-new-1' });

    expect(res.status).toBe(204);
    const oldPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: session.input.email, password: session.input.password });
    expect(oldPassword.status).toBe(401);
    await login(app, session.input.email, 'brand-new-1');

    expect((await refresh(otherDevice.refreshToken)).status).toBe(401);
    expect((await refresh(session.refreshToken)).status).toBe(200);
  });
});

describe('access tokens', () => {
  it('requires a bearer token', async () => {
    const res = await request(app).get('/api/v1/users/me');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects tampered tokens', async () => {
    const session = await registerAndLogin(app);
    const [header, payload] = session.accessToken.split('.');
    const forged = `${header}.${payload}.invalidsignature`;

    const res = await request(app).get('/api/v1/users/me').set(bearer(forged));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects expired tokens', async () => {
    const { user } = await registerUser(app);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ sid: '00000000-0000-4000-8000-000000000000' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

    const res = await request(app).get('/api/v1/users/me').set(bearer(expired));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('stop working as soon as the account is deactivated', async () => {
    const session = await registerAndLogin(app);
    await prisma.user.update({ where: { id: session.user.id }, data: { status: 'DEACTIVATED' } });

    const res = await request(app).get('/api/v1/users/me').set(bearer(session.accessToken));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});

describe('exam contract routes under /api', () => {
  it('supports register -> login -> profile without the /v1 segment', async () => {
    const input = newUserInput();

    const registered = await request(app).post('/api/auth/register').send(input);
    const loggedIn = await request(app)
      .post('/api/auth/login')
      .send({ email: input.email, password: input.password });
    const me = await request(app).get('/api/users/me').set(bearer(loggedIn.body.data.access_token));

    expect(registered.status).toBe(201);
    expectNoPasswordFields(registered.body);
    expect(loggedIn.status).toBe(200);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(input.email);
  });

  it('reports errors as { error, status } like the exam requires', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: 400, error: expect.any(String) });
  });
});
