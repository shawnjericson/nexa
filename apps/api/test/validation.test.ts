import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { httpLogger } from '../src/infrastructure/logger/http-logger';
import { AppError } from '../src/shared/errors/app-error';
import { errorHandler } from '../src/shared/http/error-handler';
import { ok } from '../src/shared/http/response';
import { validate } from '../src/shared/http/validate';

const RegisterBody = z.object({
  email: z.email(),
  password: z.string().min(6),
});

function buildApp() {
  const app = express();
  app.use(httpLogger);
  app.use(express.json());
  app.post('/register', validate({ body: RegisterBody }), (req, res) => ok(res, req.body));
  app.get(
    '/items',
    validate({ query: z.object({ page: z.coerce.number().int().min(1) }) }),
    (req, res) => ok(res, req.query),
  );
  app.get('/forbidden', () => {
    throw new AppError(403, 'POST_FORBIDDEN', 'Only the author can edit this post');
  });
  app.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  app.use(errorHandler);
  return app;
}

describe('validate middleware', () => {
  const app = buildApp();

  it('rejects invalid input with every field issue listed', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/^body\.email: /);
    expect(res.body.details).toHaveLength(2);
    expect(res.body.details.map((d: { field: string }) => d.field)).toEqual([
      'body.email',
      'body.password',
    ]);
  });

  it('passes validated data through and strips unknown fields', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: 'an@nexa.io', password: 'secret1', role: 'OWNER' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ email: 'an@nexa.io', password: 'secret1' });
  });

  it('coerces query parameters (Express 5 read-only req.query)', async () => {
    const res = await request(app).get('/items?page=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ page: 2 });
  });
});

describe('error handler', () => {
  const app = buildApp();

  it('renders AppError with its status and code', async () => {
    const res = await request(app).get('/forbidden');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      status: 403,
      error: 'Only the author can edit this post',
      code: 'POST_FORBIDDEN',
    });
  });

  it('never leaks internal error messages', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
