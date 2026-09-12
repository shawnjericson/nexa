import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';
import { Errors } from '../errors/app-error';

// In-memory store for v1; switch to a Redis store once the API runs on several instances.
export function createRateLimiter(options: { windowMs: number; limit: number }) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !env.RATE_LIMIT_ENABLED,
    handler: (_req, _res, next) => next(Errors.tooManyRequests()),
  });
}

export const globalRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 300 });
