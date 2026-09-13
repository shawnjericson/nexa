import type { DomainEvent } from '../../../shared/events/event-bus';

export interface AuditEntry {
  /** The domain event id, which makes recording idempotent. */
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  subjectId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

/** Only organization-scoped events are audited: they are what organization auditors review. */
export function toAuditEntry(event: DomainEvent): AuditEntry | null {
  if (!event.organization_id) return null;
  return {
    id: event.id,
    organizationId: event.organization_id,
    actorId: event.actor_id,
    action: event.type,
    subjectId: event.subject_id,
    metadata: { ...event.metadata },
    occurredAt: new Date(event.timestamp),
  };
}
