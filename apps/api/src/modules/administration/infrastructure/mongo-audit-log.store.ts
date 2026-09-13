import { MongoBulkWriteError, MongoServerError, type Collection, type Filter } from 'mongodb';
import type { AuditEntry } from '../domain/audit';
import type { AuditCursor, AuditLogStore } from '../domain/ports';

export interface AuditDocument {
  /** The domain event id. */
  _id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  subject_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: Date;
  recorded_at: Date;
}

const DUPLICATE_KEY = 11000;

function toDocument(entry: AuditEntry): AuditDocument {
  return {
    _id: entry.id,
    organization_id: entry.organizationId,
    actor_id: entry.actorId,
    action: entry.action,
    subject_id: entry.subjectId,
    metadata: entry.metadata,
    occurred_at: entry.occurredAt,
    recorded_at: new Date(),
  };
}

function toEntry(document: AuditDocument): AuditEntry {
  return {
    id: document._id,
    organizationId: document.organization_id,
    actorId: document.actor_id,
    action: document.action,
    subjectId: document.subject_id,
    metadata: document.metadata,
    occurredAt: document.occurred_at,
  };
}

/** Duplicates mean the entry is already stored - that's success for an idempotent writer. */
function onlyDuplicates(err: unknown): boolean {
  if (err instanceof MongoBulkWriteError) {
    const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
    return writeErrors.length > 0 && writeErrors.every((error) => error.code === DUPLICATE_KEY);
  }
  return err instanceof MongoServerError && err.code === DUPLICATE_KEY;
}

export class MongoAuditLogStore implements AuditLogStore {
  constructor(private readonly collection: Collection<AuditDocument>) {}

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndexes([
      { key: { organization_id: 1, occurred_at: -1, _id: -1 }, name: 'organization_time' },
      { key: { organization_id: 1, action: 1, occurred_at: -1 }, name: 'organization_action_time' },
    ]);
  }

  async insert(entry: AuditEntry): Promise<void> {
    try {
      await this.collection.insertOne(toDocument(entry));
    } catch (err) {
      if (!onlyDuplicates(err)) throw err;
    }
  }

  async insertMany(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.collection.insertMany(entries.map(toDocument), { ordered: false });
    } catch (err) {
      if (!onlyDuplicates(err)) throw err;
    }
  }

  async list(
    organizationId: string,
    { take, action, before }: { take: number; action?: string; before?: AuditCursor },
  ): Promise<AuditEntry[]> {
    const filter: Filter<AuditDocument> = {
      organization_id: organizationId,
      ...(action && { action }),
      ...(before && {
        $or: [
          { occurred_at: { $lt: before.occurredAt } },
          { occurred_at: before.occurredAt, _id: { $lt: before.id } },
        ],
      }),
    };
    const documents = await this.collection
      .find(filter)
      .sort({ occurred_at: -1, _id: -1 })
      .limit(take)
      .toArray();
    return documents.map(toEntry);
  }
}
