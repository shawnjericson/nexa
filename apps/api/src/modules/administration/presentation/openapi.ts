import { z } from 'zod';
import { paginatedResponse } from '../../../shared/http/openapi';
import { registerRoute } from '../../../shared/http/openapi-route';
import { AuditEntryResponse, AuditLogQuery } from './schemas';

registerRoute({
  method: 'get',
  path: '/api/v1/audit-logs',
  tag: 'Administration',
  summary: 'Audit log of the active organization (audit.read)',
  description:
    'Administrative and moderation actions: organization settings, invitations, role and status ' +
    'changes, removals, departments, and deletions of posts, comments and messages. Stored in ' +
    'MongoDB; 503 when the server has no audit storage.',
  headers: z.object({
    'x-organization-id': z.uuid().optional().openapi({
      description: 'Active organization. Optional when you belong to exactly one organization.',
    }),
  }),
  query: AuditLogQuery,
  response: paginatedResponse(
    AuditEntryResponse,
    z.object({ next_cursor: z.string().nullable(), has_next: z.boolean(), limit: z.number() }),
  ),
  errors: [400, 401, 403, 503],
});
