import type { Logger } from 'pino';
import { z } from 'zod';
import type { DomainEvent } from '../../../shared/events/event-bus';
import type { OrganizationActor } from '../../organization';
import { toAuditEntry, type AuditEntry } from '../domain/audit';
import { AuditErrors } from '../domain/audit-errors';
import type { AuditCursor, AuditLogStore, PendingAuditQueue } from '../domain/ports';

const CursorPayload = z.object({ t: z.iso.datetime(), id: z.string().min(1).max(100) });

export function encodeAuditCursor(entry: Pick<AuditEntry, 'occurredAt' | 'id'>): string {
  return Buffer.from(JSON.stringify({ t: entry.occurredAt.toISOString(), id: entry.id })).toString(
    'base64url',
  );
}

function decodeAuditCursor(value: string): AuditCursor {
  try {
    const payload = CursorPayload.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return { occurredAt: new Date(payload.t), id: payload.id };
  } catch {
    throw AuditErrors.invalidCursor();
  }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Records audited domain events in MongoDB. If MongoDB is unavailable the entry is kept in
 * PostgreSQL and flushed later, so an outage delays the audit log instead of losing it
 * (risk register 21, ADR-016).
 */
export class AuditService {
  constructor(
    private readonly deps: {
      store: AuditLogStore | null;
      pending: PendingAuditQueue;
      logger: Logger;
    },
  ) {}

  async record(event: DomainEvent): Promise<void> {
    const entry = toAuditEntry(event);
    if (!entry || !this.deps.store) return;
    try {
      await this.deps.store.insert(entry);
    } catch (err) {
      this.deps.logger.warn(
        { err, event_id: event.id },
        'Audit log write failed; queued for retry',
      );
      await this.deps.pending.enqueue(entry, messageOf(err));
    }
  }

  /** Moves queued entries into the audit log. Returns how many were flushed. */
  async flushPending(limit = 100): Promise<number> {
    if (!this.deps.store) return 0;
    const entries = await this.deps.pending.take(limit);
    if (entries.length === 0) return 0;

    const ids = entries.map((entry) => entry.id);
    try {
      await this.deps.store.insertMany(entries);
      await this.deps.pending.remove(ids);
      return entries.length;
    } catch (err) {
      await this.deps.pending.recordFailure(ids, messageOf(err));
      return 0;
    }
  }

  async list(
    actor: OrganizationActor,
    options: { limit: number; cursor?: string; action?: string },
  ): Promise<{ items: AuditEntry[]; hasMore: boolean }> {
    if (!this.deps.store) throw AuditErrors.unavailable();
    const rows = await this.deps.store.list(actor.organization.organizationId, {
      take: options.limit + 1,
      action: options.action,
      before: options.cursor ? decodeAuditCursor(options.cursor) : undefined,
    });
    return { items: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
  }
}
