import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../errors/app-error';
import { ErrorResponse, jsonContent, registry, successResponse } from './openapi';
import { ok } from './response';

export type ReadinessCheck = () => Promise<void>;

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'The process is alive',
      content: jsonContent(
        successResponse(
          z.object({
            status: z.literal('ok'),
            uptime_seconds: z.number().int(),
            timestamp: z.string(),
          }),
        ),
      ),
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/ready',
  tags: ['System'],
  summary: 'Readiness probe - checks every dependency',
  responses: {
    200: {
      description: 'All dependencies are reachable',
      content: jsonContent(
        successResponse(
          z.object({
            status: z.literal('ready'),
            checks: z.record(z.string(), z.enum(['up', 'down'])),
          }),
        ),
      ),
    },
    503: { description: 'At least one dependency is down', content: jsonContent(ErrorResponse) },
  },
});

const CHECK_TIMEOUT_MS = 3_000;

async function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health - the process is alive (used by load balancers / uptime monitors).
 * GET /ready  - every dependency the API needs is reachable; 503 otherwise.
 */
export function healthRouter(checks: Record<string, ReadinessCheck> = {}): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    ok(res, {
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', async (req, res) => {
    const entries = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => {
        try {
          await withTimeout(check(), CHECK_TIMEOUT_MS);
          return [name, 'up'] as const;
        } catch (err) {
          req.log.warn({ err, dependency: name }, 'Readiness check failed');
          return [name, 'down'] as const;
        }
      }),
    );
    const results = Object.fromEntries(entries);

    if (entries.some(([, status]) => status === 'down')) {
      throw Errors.serviceUnavailable(
        'One or more dependencies are unavailable',
        'NOT_READY',
        results,
      );
    }
    ok(res, { status: 'ready', checks: results });
  });

  return router;
}
