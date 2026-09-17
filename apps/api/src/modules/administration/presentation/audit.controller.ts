import type { Request, RequestHandler } from 'express';
import { paginated } from '../../../shared/http/response';
import { requireAuthContext, toUserReference, type UserDirectory } from '../../identity';
import { organizationContext, type OrganizationActor } from '../../organization';
import { encodeAuditCursor, type AuditService } from '../application/audit.service';
import type { AuditLogQueryInput } from './schemas';

/** Handlers for the audit log: read the request, call the service, shape the response. */
export function createAuditController(deps: { audit: AuditService; users: UserDirectory }) {
  const { audit, users } = deps;

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

  return { list };
}
