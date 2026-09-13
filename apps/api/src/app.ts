import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import { env } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { logger } from './infrastructure/logger/logger';
import { httpLogger } from './infrastructure/logger/http-logger';
import { RealtimeHub } from './infrastructure/websocket/realtime-hub';
import { createCommunicationModule } from './modules/communication';
import { createIdentityModule } from './modules/identity';
import { createOrganizationModule } from './modules/organization';
import { createSocialModule } from './modules/social';
import { InProcessEventBus } from './shared/events/event-bus';
import { docsRouter } from './shared/http/docs.routes';
import { errorHandler } from './shared/http/error-handler';
import { healthRouter, type ReadinessCheck } from './shared/http/health.routes';
import { notFoundHandler } from './shared/http/not-found';
import { globalRateLimiter } from './shared/http/rate-limit';

export interface AppDependencies {
  prisma: PrismaClient;
  /** Optional: presence and multi-instance fan-out use Redis when it is provided. */
  redis?: Redis | null;
  /** Socket.IO hub; server.ts attaches it to the HTTP server. Emits are no-ops until then. */
  realtime?: RealtimeHub;
  readinessChecks?: Record<string, ReadinessCheck>;
}

/**
 * Composition root and request pipeline (spec section 17):
 * request id + logging -> security headers -> CORS -> rate limit -> body parsing
 * -> JWT -> organization context -> validation -> controller -> service -> repository
 */
export function createApp({
  prisma,
  redis = null,
  realtime = new RealtimeHub(),
  readinessChecks = {},
}: AppDependencies): Express {
  const events = new InProcessEventBus(logger);
  const organization = createOrganizationModule({ prisma, events, config: env });
  const identity = createIdentityModule({
    prisma,
    events,
    profileVisibility: organization.profileVisibility,
    config: env,
  });
  const guard = [identity.requireAuth, organization.requireOrganization];
  const social = createSocialModule({ prisma, events, authors: identity.userDirectory, guard });
  const communication = createCommunicationModule({
    prisma,
    events,
    hub: realtime,
    redis,
    users: identity.userDirectory,
    directory: organization.directory,
    authenticate: identity.authenticate,
    resolveContext: organization.resolveContext,
    guard,
  });
  const organizationRouter = organization.createRouter({
    requireAuth: identity.requireAuth,
    users: identity.userDirectory,
  });

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
  v1.use('/auth', identity.authRouter);
  v1.use('/users', identity.usersRouter);
  v1.use(organizationRouter);
  v1.use(social.v1);
  v1.use(communication.router);
  app.use('/api/v1', v1);

  // Exam contract (ADR-010): the same use cases without the version segment.
  const exam = express.Router();
  exam.use('/auth', identity.authRouter);
  exam.use('/users', identity.usersRouter);
  exam.use(social.exam);
  app.use('/api', exam);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
