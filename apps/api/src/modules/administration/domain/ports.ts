import type { AuditEntry } from './audit';

/** Keyset position: (occurred_at, id) of the last entry of the previous page. */
export interface AuditCursor {
  occurredAt: Date;
  id: string;
}

/** The audit log proper (MongoDB, ADR-009). */
export interface AuditLogStore {
  /** Idempotent: an entry id is stored once (risk register 12.2). */
  insert(entry: AuditEntry): Promise<void>;
  insertMany(entries: AuditEntry[]): Promise<void>;
  /** Newest first. */
  list(
    organizationId: string,
    options: { take: number; action?: string; before?: AuditCursor },
  ): Promise<AuditEntry[]>;
}

/** Entries the audit log could not take yet, kept in PostgreSQL until a retry succeeds. */
export interface PendingAuditQueue {
  enqueue(entry: AuditEntry, error: string): Promise<void>;
  /** Oldest first. */
  take(limit: number): Promise<AuditEntry[]>;
  remove(ids: string[]): Promise<void>;
  recordFailure(ids: string[], error: string): Promise<void>;
}
