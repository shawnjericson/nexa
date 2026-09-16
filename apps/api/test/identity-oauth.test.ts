import type { Express } from 'express';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { GoogleIdTokenVerifier } from '../src/modules/identity/infrastructure/google-id-token.verifier';
import { bearer, registerUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const CLIENT_ID = 'nexa-test.apps.googleusercontent.com';
const NONCE = 'n0nce-of-this-sign-in-request';

let app: Express;
let signingKey: CryptoKey;

beforeAll(async () => {
  // Stand-in for Google's keys: same verification code, keys generated for the test.
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  const publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
  app = createApp({
    prisma,
    externalIdentity: new GoogleIdTokenVerifier(
      CLIENT_ID,
      createLocalJWKSet({ keys: [publicJwk] }),
    ),
  });
});
beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function googleToken(
  claims: Record<string, unknown> = {},
  options: { audience?: string; issuer?: string; subject?: string } = {},
): Promise<string> {
  return new SignJWT({
    email: 'lan.pham@gmail.com',
    email_verified: true,
    name: 'Lan Phạm',
    nonce: NONCE,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject(options.subject ?? 'google-subject-1')
    .setIssuer(options.issuer ?? 'https://accounts.google.com')
    .setAudience(options.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey);
}

const signIn = async (idToken: string | Promise<string>, nonce = NONCE) =>
  request(app)
    .post('/api/v1/auth/oauth/google')
    .send({ id_token: await idToken, nonce });

describe('POST /api/v1/auth/oauth/google', () => {
  it('creates an account for a new email, then signs in to the same one', async () => {
    const first = await signIn(googleToken());

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      created: true,
      user: { email: 'lan.pham@gmail.com', username: 'lan.pham', display_name: 'Lan Phạm' },
    });
    const me = await request(app).get('/api/v1/users/me').set(bearer(first.body.data.access_token));
    expect(me.status).toBe(200);

    const again = await signIn(googleToken());
    expect(again.status).toBe(200);
    expect(again.body.data.created).toBe(false);
    expect(again.body.data.user.id).toBe(first.body.data.user.id);
  });

  it('accepts only tokens for this app, from Google, for this sign-in', async () => {
    const otherApp = await signIn(googleToken({}, { audience: 'someone-else' }));
    const otherIssuer = await signIn(googleToken({}, { issuer: 'https://evil.example' }));
    const otherNonce = await signIn(googleToken(), 'a-nonce-from-another-sign-in');

    for (const res of [otherApp, otherIssuer, otherNonce]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_EXTERNAL_TOKEN');
    }
  });

  it('refuses emails Google has not verified', async () => {
    const res = await signIn(googleToken({ email_verified: false }));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EXTERNAL_EMAIL_UNVERIFIED');
  });

  it('asks for the password before connecting Google to an existing account', async () => {
    const { input, user } = await registerUser(app, { email: 'lan.pham@gmail.com' });

    const attempt = await signIn(googleToken());
    expect(attempt.status).toBe(409);
    expect(attempt.body.code).toBe('ACCOUNT_LINK_REQUIRED');
    const { link_token: linkToken, email } = attempt.body.details;
    expect(email).toBe('lan.pham@gmail.com');

    // A link token is not an access token.
    expect((await request(app).get('/api/v1/users/me').set(bearer(linkToken))).status).toBe(401);

    const wrong = await request(app)
      .post('/api/v1/auth/oauth/link')
      .send({ link_token: linkToken, password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const linked = await request(app)
      .post('/api/v1/auth/oauth/link')
      .send({ link_token: linkToken, password: input.password });
    expect(linked.status).toBe(200);
    expect(linked.body.data.user.id).toBe(user.id);

    // From now on Google signs straight in to that account.
    const later = await signIn(googleToken());
    expect(later.status).toBe(200);
    expect(later.body.data).toMatchObject({ created: false, user: { id: user.id } });
  });

  it('is off without a Google client ID', async () => {
    const disabled = createApp({ prisma, externalIdentity: null });
    const res = await request(disabled)
      .post('/api/v1/auth/oauth/google')
      .send({ id_token: await googleToken(), nonce: NONCE });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SSO_NOT_CONFIGURED');
  });
});
