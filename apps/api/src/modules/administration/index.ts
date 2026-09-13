import type { RequestHandler, Router } from 'express';
import type { Collection } from 'mongodb';
import type { PrismaClient } from '../../generated/prisma/client';
import { logger } from '../../infrastructure/logger/logger';
import type { EventBus } from '../../shared/events/event-bus';
import type { UserDirectory } from '../identity';
import { AuditService } from './application/audit.service';
import { AUDITED_EVENTS } from './application/audited-events';
import { MongoAuditLogStore, type AuditDocument } from './infrastructure/mongo-audit-log.store';
import { PrismaPendingAuditQueue } from './infrastructure/prisma-pending-audit.queue';
import './presentation/openapi';
import { createAuditRouter } from './presentation/routes';

export type { AuditDocument } from './infrastructure/mongo-audit-log.store';

const FLUSH_INTERVAL_MS = 30_000;

export interface AdministrationModule {
  /** Audit log endpoints, mounted under /api/v1. */
  router: Router;
  /** Retries audit entries queued while MongoDB was unavailable. */
  flushPendingAudit(): Promise<number>;
}

export function createAdministrationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  /** null disables the audit log (no MongoDB configured). */
  auditCollection: Collection<AuditDocument> | null;
  users: UserDirectory;
  guard: RequestHandler[];
  /** Start the periodic flush of queued audit entries (the server does; tests don't). */
  backgroundJobs?: boolean;
}): AdministrationModule {
  const store = deps.auditCollection ? new MongoAuditLogStore(deps.auditCollection) : null;
  const audit = new AuditService({
    store,
    pending: new PrismaPendingAuditQueue(deps.prisma),
    logger,
  });

  if (store) {
    store
      .ensureIndexes()
      .catch((err: unknown) => logger.warn({ err }, 'Could not create audit log indexes'));
    for (const type of AUDITED_EVENTS) {
      deps.events.subscribe(type, (event) => audit.record(event));
    }
    if (deps.backgroundJobs) {
      setInterval(() => {
        audit.flushPending().catch((err: unknown) => logger.warn({ err }, 'Audit flush failed'));
      }, FLUSH_INTERVAL_MS).unref();
    }
  }

  return {
    router: createAuditRouter({ audit, users: deps.users, guard: deps.guard }),
    flushPendingAudit: () => audit.flushPending(),
  };
}
