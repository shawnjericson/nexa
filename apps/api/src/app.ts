import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { httpLogger } from './infrastructure/logger/http-logger';
import { docsRouter } from './shared/http/docs.routes';
import { errorHandler } from './shared/http/error-handler';
import { healthRouter, type ReadinessCheck } from './shared/http/health.routes';
import { notFoundHandler } from './shared/http/not-found';
import { globalRateLimiter } from './shared/http/rate-limit';

export interface AppDependencies {
  readinessChecks?: Record<string, ReadinessCheck>;
}

/**
 * Request pipeline (spec section 17):
 * request id + logging -> security headers -> CORS -> rate limit -> body parsing -> routes -> errors
 */
export function createApp({ readinessChecks = {} }: AppDependencies = {}): Express {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  app.use(healthRouter(readinessChecks));
  app.use(docsRouter());

  app.use(globalRateLimiter);
  app.use(express.json({ limit: '100kb' }));

  const v1 = express.Router();
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
