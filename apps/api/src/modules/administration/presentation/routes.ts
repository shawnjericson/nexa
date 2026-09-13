import { Router, type Request, type RequestHandler } from 'express';
import { paginated } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { requireAuthContext, toUserReference, type UserDirectory } from '../../identity';
import { organizationContext, requirePermission, type OrganizationActor } from '../../organization';
import { encodeAuditCursor, type AuditService } from '../application/audit.service';
import { AuditLogQuery, type AuditLogQueryInput } from './schemas';

/** Audit log of the active organization, for holders of audit.read. */
export function createAuditRouter(deps: {
  audit: AuditService;
  users: UserDirectory;
  guard: RequestHandler[];
}): Router {
  const { audit, users, guard } = deps;

  const actorOf = (req: Request): OrganizationActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });

  const list: RequestHandler = async (req, res) => {
    const query = req.query as unknown as AuditLogQueryInput;
    const page = await audit.list(actorOf(req), query);
    const directory = await users.getSummaries(
      page.items.flatMap((entry) => (entry.actorId ? [entry.actorId] : [])),
    );
    const last = page.items.at(-1);
    paginated(
      res,
      page.items.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actor: entry.actorId ? toUserReference(directory.get(entry.actorId)) : null,
        subject_id: entry.subjectId,
        metadata: entry.metadata,
        occurred_at: entry.occurredAt.toISOString(),
      })),
      {
        next_cursor: page.hasMore && last ? encodeAuditCursor(last) : null,
        has_next: page.hasMore,
        limit: query.limit,
      },
    );
  };

  const router = Router();
  router.get(
    '/audit-logs',
    ...guard,
    requirePermission('audit.read'),
    validate({ query: AuditLogQuery }),
    list,
  );
  return router;
}
