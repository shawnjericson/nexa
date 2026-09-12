import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const healthyApp = createApp({ readinessChecks: { database: async () => {} } });

describe('health & readiness', () => {
  it('GET /health reports the process is alive', async () => {
    const res = await request(healthyApp).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('GET /ready returns 200 when every dependency is up', async () => {
    const res = await request(healthyApp).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', checks: { database: 'up' } });
  });

  it('GET /ready returns 503 when a dependency is down', async () => {
    const app = createApp({
      readinessChecks: {
        database: async () => {
          throw new Error('connection refused');
        },
      },
    });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      status: 503,
      code: 'NOT_READY',
      details: { database: 'down' },
    });
  });
});

describe('request id', () => {
  it('generates a request id when the client does not send one', async () => {
    const res = await request(healthyApp).get('/health');

    expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it('reuses a well-formed incoming X-Request-Id', async () => {
    const res = await request(healthyApp).get('/health').set('X-Request-Id', 'trace-123');

    expect(res.headers['x-request-id']).toBe('trace-123');
  });

  it('ignores a malformed incoming X-Request-Id', async () => {
    const res = await request(healthyApp).get('/health').set('X-Request-Id', 'bad id <script>');

    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });
});

describe('error contract', () => {
  it('unknown routes return 404 in the unified error format', async () => {
    const res = await request(healthyApp).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      status: 404,
      error: 'Route GET /api/v1/does-not-exist not found',
      code: 'ROUTE_NOT_FOUND',
      request_id: res.headers['x-request-id'],
    });
  });

  it('malformed JSON bodies return 400 INVALID_JSON', async () => {
    const res = await request(healthyApp)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, status: 400, code: 'INVALID_JSON' });
  });

  it('sets security headers', async () => {
    const res = await request(healthyApp).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('API documentation', () => {
  it('serves the OpenAPI document', async () => {
    const res = await request(healthyApp).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('NEXA API');
  });
});
