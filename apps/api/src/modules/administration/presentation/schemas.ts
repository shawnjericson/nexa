import { z } from 'zod';
import '../../../shared/http/openapi';
import { UserReference } from '../../identity';

export const AuditLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
  action: z
    .string()
    .regex(/^[a-z_]+\.[a-z_]+$/, 'Use an event type such as organization.member_updated')
    .optional(),
});

export const AuditEntryResponse = z
  .object({
    id: z.string().openapi({ description: 'Id of the domain event that was audited' }),
    action: z.string().openapi({ example: 'organization.member_updated' }),
    actor: UserReference.nullable(),
    subject_id: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    occurred_at: z.iso.datetime(),
  })
  .openapi('AuditEntry');

export type AuditLogQueryInput = z.infer<typeof AuditLogQuery>;
