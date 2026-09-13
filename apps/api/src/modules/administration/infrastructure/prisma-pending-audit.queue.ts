import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import type { AuditEntry } from '../domain/audit';
import type { PendingAuditQueue } from '../domain/ports';

const trim = (error: string) => error.slice(0, 500);

function serialize(entry: AuditEntry): Prisma.InputJsonObject {
  return { ...entry, occurredAt: entry.occurredAt.toISOString() } as Prisma.InputJsonObject;
}

function deserialize(value: Prisma.JsonValue): AuditEntry {
  const stored = value as unknown as Omit<AuditEntry, 'occurredAt'> & { occurredAt: string };
  return { ...stored, occurredAt: new Date(stored.occurredAt) };
}

/** PostgreSQL is always available when the business write succeeded, so nothing gets lost. */
export class PrismaPendingAuditQueue implements PendingAuditQueue {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(entry: AuditEntry, error: string): Promise<void> {
    await this.prisma.pendingAuditEvent.upsert({
      where: { eventId: entry.id },
      create: { eventId: entry.id, entry: serialize(entry), lastError: trim(error) },
      update: { lastError: trim(error), attempts: { increment: 1 } },
    });
  }

  async take(limit: number): Promise<AuditEntry[]> {
    const rows = await this.prisma.pendingAuditEvent.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { entry: true },
    });
    return rows.map((row) => deserialize(row.entry));
  }

  async remove(ids: string[]): Promise<void> {
    await this.prisma.pendingAuditEvent.deleteMany({ where: { eventId: { in: ids } } });
  }

  async recordFailure(ids: string[], error: string): Promise<void> {
    await this.prisma.pendingAuditEvent.updateMany({
      where: { eventId: { in: ids } },
      data: { attempts: { increment: 1 }, lastError: trim(error) },
    });
  }
}
