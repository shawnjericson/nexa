import { Router, type RequestHandler } from 'express';
import { validate } from '../../../shared/http/validate';
import type { UserDirectory } from '../../identity';
import { requirePermission } from '../../organization';
import type { AuditService } from '../application/audit.service';
import { createAuditController } from './audit.controller';
import { AuditLogQuery } from './schemas';

/** Audit log of the active organization, for holders of audit.read. Handlers: audit.controller.ts. */
export function createAuditRouter(deps: {
  audit: AuditService;
  users: UserDirectory;
  guard: RequestHandler[];
}): Router {
  const controller = createAuditController(deps);
  const router = Router();
  router.get(
    '/audit-logs',
    ...deps.guard,
    requirePermission('audit.read'),
    validate({ query: AuditLogQuery }),
    controller.list,
  );
  return router;
}
