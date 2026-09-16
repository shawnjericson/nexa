import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { env } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { logger } from './infrastructure/logger/logger';
import { httpLogger } from './infrastructure/logger/http-logger';
import type { ObjectStorage } from './infrastructure/storage/object-storage';
import { RealtimeHub } from './infrastructure/websocket/realtime-hub';
import { createAdministrationModule, type AuditDocument } from './modules/administration';
import { createCommunicationModule } from './modules/communication';
import { createFileModule } from './modules/file';
import { createIdentityModule, type ExternalIdentityVerifier } from './modules/identity';
import { createNotificationModule } from './modules/notification';
import { createOrganizationModule } from './modules/organization';
import { createSearchModule } from './modules/search';
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
  /** Optional: the audit log lives in MongoDB; without it the audit log is disabled. */
  mongo?: Db | null;
  /** Optional: files live in S3-compatible object storage; without it uploads are disabled. */
  storage?: ObjectStorage | null;
  /** Socket.IO hub; server.ts attaches it to the HTTP server. Emits are no-ops until then. */
  realtime?: RealtimeHub;
  /**
   * Google ID token verification; by default built from GOOGLE_CLIENT_ID. Tests pass a verifier
   * with their own keys; null turns Google sign-in off.
   */
  externalIdentity?: ExternalIdentityVerifier | null;
  /** Periodic jobs such as retrying queued audit entries (the server enables them). */
  backgroundJobs?: boolean;
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
  mongo = null,
  storage = null,
  realtime = new RealtimeHub(),
  externalIdentity,
  backgroundJobs = false,
  readinessChecks = {},
}: AppDependencies): Express {
  const events = new InProcessEventBus(logger);
  const organization = createOrganizationModule({ prisma, events, config: env });
  const identity = createIdentityModule({
    prisma,
    events,
    profileVisibility: organization.profileVisibility,
    config: env,
    externalIdentity,
  });
  const users = identity.userDirectory;
  const guard = [identity.requireAuth, organization.requireOrganization];

  const files = createFileModule({
    prisma,
    storage,
    policy: { maxBytes: env.FILE_MAX_BYTES, maxPendingUploads: env.FILE_MAX_PENDING_UPLOADS },
    guard,
    avatars: identity.avatars,
    publicUrl: env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`,
    backgroundJobs,
  });
  const social = createSocialModule({
    prisma,
    events,
    authors: users,
    files: files.directory,
    guard,
  });
  const communication = createCommunicationModule({
    prisma,
    events,
    hub: realtime,
    redis,
    users,
    directory: organization.directory,
    files: files.directory,
    authenticate: identity.authenticate,
    resolveContext: organization.resolveContext,
    guard,
  });
  // Consumers of the other modules' domain events.
  const notification = createNotificationModule({
    prisma,
    events,
    hub: realtime,
    users,
    directory: organization.directory,
    guard,
  });
  const administration = createAdministrationModule({
    prisma,
    events,
    auditCollection: mongo ? mongo.collection<AuditDocument>(env.MONGODB_AUDIT_COLLECTION) : null,
    users,
    guard,
    backgroundJobs,
  });
  const search = createSearchModule({
    users,
    directory: organization.directory,
    posts: social.search,
    chat: communication.search,
    guard,
  });
  const organizationRouter = organization.createRouter({
    requireAuth: identity.requireAuth,
    users,
  });

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  app.use(healthRouter(readinessChecks));
  app.use(docsRouter());
  // Avatar pictures, before the global rate limit: one page can show dozens of them.
  app.use('/api/v1', files.publicRouter);

  app.use(globalRateLimiter);
  app.use(express.json({ limit: '100kb' }));

  const v1 = express.Router();
  v1.use('/auth', identity.authRouter);
  v1.use('/users', identity.usersRouter);
  v1.use(organizationRouter);
  v1.use(social.v1);
  v1.use(communication.router);
  v1.use(files.router);
  v1.use(search.router);
  v1.use(notification.router);
  v1.use(administration.router);
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
