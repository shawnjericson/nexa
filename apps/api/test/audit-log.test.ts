import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Collection, MongoClient } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { logger } from '../src/infrastructure/logger/logger';
import { createMongoClient } from '../src/infrastructure/mongo/mongo';
import type { AuditDocument } from '../src/modules/administration';
import { AuditService } from '../src/modules/administration/application/audit.service';
import type { AuditEntry } from '../src/modules/administration/domain/audit';
import type { AuditLogStore } from '../src/modules/administration/domain/ports';
import { MongoAuditLogStore } from '../src/modules/administration/infrastructure/mongo-audit-log.store';
import { PrismaPendingAuditQueue } from '../src/modules/administration/infrastructure/prisma-pending-audit.queue';
import { DEPARTMENT_CREATED, MEMBER_UPDATED } from '../src/modules/organization';
import { POST_DELETED } from '../src/modules/social';
import { createEvent } from '../src/shared/events/event-bus';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam, moveToNewOrganization } from './helpers/team';

// The app under test runs without MongoDB; these tests hand it a Db explicitly and write to
// a separate collection (MONGODB_AUDIT_COLLECTION=test_audit_logs) that they drop afterwards.
const mongoUri = process.env.TEST_MONGODB_URI ?? '';
const collectionName = process.env.MONGODB_AUDIT_COLLECTION ?? 'test_audit_logs';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

interface AuditBody {
  id: string;
  action: string;
  actor: { id: string } | null;
  subject_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

async function defaultOrganizationId() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'nexa-test' },
  });
  return organization.id;
}

const auditLog = (app: Express, token: string, query: Record<string, string | number> = {}) =>
  request(app).get('/api/v1/audit-logs').query(query).set(bearer(token));

describe.skipIf(!mongoUri)('audit log (MongoDB)', () => {
  let client: MongoClient;
  let collection: Collection<AuditDocument>;
  let app: Express;

  beforeAll(() => {
    client = createMongoClient(mongoUri);
    const db = client.db();
    collection = db.collection<AuditDocument>(collectionName);
    app = createApp({ prisma, mongo: db });
  });
  beforeEach(async () => {
    await collection.deleteMany({});
  });
  afterAll(async () => {
    await collection.drop().catch(() => undefined);
    await client.close();
  });

  it('records role changes, readable by holders of audit.read only', async () => {
    const { owner, alice, bob } = await createTeam(app);
    const organizationId = await defaultOrganizationId();
    await request(app)
      .patch(`/api/v1/organizations/${organizationId}/members/${alice.user.id}`)
      .set(bearer(owner.accessToken))
      .send({ role: 'ADMIN' });

    const asOwner = await auditLog(app, owner.accessToken, { action: MEMBER_UPDATED });
    const asAdmin = await auditLog(app, alice.accessToken, { action: MEMBER_UPDATED });
    const asMember = await auditLog(app, bob.accessToken);

    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).toEqual([
      {
        id: expect.stringMatching(/^evt_/),
        action: MEMBER_UPDATED,
        actor: expect.objectContaining({ id: owner.user.id }),
        subject_id: alice.user.id,
        metadata: expect.objectContaining({ role: 'ADMIN', previous_role: 'MEMBER' }),
        occurred_at: expect.any(String),
      },
    ]);
    expect(asAdmin.body.data).toEqual(asOwner.body.data);
    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe('PERMISSION_DENIED');
  });

  it('tells moderation apart from authors deleting their own posts', async () => {
    const { owner, alice } = await createTeam(app);
    const createPost = async () =>
      (
        await request(app)
          .post('/api/v1/posts')
          .set(bearer(alice.accessToken))
          .send({ content: 'to be deleted' })
      ).body.data as { id: string };
    const own = await createPost();
    const moderated = await createPost();

    const byAuthor = await request(app)
      .delete(`/api/v1/posts/${own.id}`)
      .set(bearer(alice.accessToken));
    const byModerator = await request(app)
      .delete(`/api/v1/posts/${moderated.id}`)
      .set(bearer(owner.accessToken));

    expect(byAuthor.status).toBeLessThan(300);
    expect(byModerator.status).toBeLessThan(300);
    const res = await auditLog(app, owner.accessToken, { action: POST_DELETED });
    expect(
      (res.body.data as AuditBody[]).map((e) => [e.subject_id, e.actor?.id, e.metadata]),
    ).toEqual([
      [moderated.id, owner.user.id, { author_id: alice.user.id, moderated: true }],
      [own.id, alice.user.id, { author_id: alice.user.id, moderated: false }],
    ]);
  });

  it("keeps each organization's log to itself and pages through it", async () => {
    const { owner } = await createTeam(app);
    const mallory = await registerAndLogin(app);
    const rival = await moveToNewOrganization(mallory.user.id, 'rival-company');
    const organizationId = await defaultOrganizationId();
    for (const name of ['Engineering', 'Sales', 'Support']) {
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/departments`)
        .set(bearer(owner.accessToken))
        .send({ name });
    }
    await request(app)
      .post(`/api/v1/organizations/${rival.id}/departments`)
      .set(bearer(mallory.accessToken))
      .send({ name: 'Rival R&D' });

    const query = { action: DEPARTMENT_CREATED, limit: 2 };
    const page1 = await auditLog(app, owner.accessToken, query);
    const page2 = await auditLog(app, owner.accessToken, {
      ...query,
      cursor: page1.body.pagination.next_cursor,
    });
    const rivalLog = await auditLog(app, mallory.accessToken, { action: DEPARTMENT_CREATED });

    const names = (res: typeof page1) =>
      (res.body.data as AuditBody[]).map((entry) => entry.metadata.name);
    expect(names(page1)).toEqual(['Support', 'Sales']);
    expect(page1.body.pagination).toMatchObject({ has_next: true, limit: 2 });
    expect(names(page2)).toEqual(['Engineering']);
    expect(page2.body.pagination).toMatchObject({ has_next: false, next_cursor: null });
    expect(names(rivalLog)).toEqual(['Rival R&D']);
  });

  it('validates the action filter and the cursor', async () => {
    const { owner } = await createTeam(app);

    const badAction = await auditLog(app, owner.accessToken, { action: 'DROP TABLE' });
    const badCursor = await auditLog(app, owner.accessToken, { cursor: 'garbage' });

    expect(badAction.status).toBe(400);
    expect(badAction.body.details[0].field).toBe('query.action');
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');
  });

  it('stores an event once however often it is recorded (12.2)', async () => {
    const store = new MongoAuditLogStore(collection);
    const entry: AuditEntry = {
      id: `evt_${randomUUID()}`,
      organizationId: randomUUID(),
      actorId: null,
      action: 'organization.updated',
      subjectId: null,
      metadata: { fields: ['name'] },
      occurredAt: new Date(),
    };
    const other: AuditEntry = { ...entry, id: `evt_${randomUUID()}` };

    await store.insert(entry);
    await store.insert(entry);
    await store.insertMany([entry, other]);

    expect(await collection.countDocuments({ organization_id: entry.organizationId })).toBe(2);
  });
});

/** An audit store that fails until it is switched back on. */
class FlakyStore implements AuditLogStore {
  available = false;
  readonly entries: AuditEntry[] = [];

  insert(entry: AuditEntry): Promise<void> {
    this.ensureAvailable();
    this.entries.push(entry);
    return Promise.resolve();
  }

  insertMany(entries: AuditEntry[]): Promise<void> {
    this.ensureAvailable();
    this.entries.push(...entries);
    return Promise.resolve();
  }

  list(): Promise<AuditEntry[]> {
    return Promise.resolve(this.entries);
  }

  private ensureAvailable() {
    if (!this.available) throw new Error('connection refused');
  }
}

describe('audit log without MongoDB', () => {
  it('answers 503 when no audit store is configured', async () => {
    const app = createApp({ prisma });
    const { owner } = await createTeam(app);

    const res = await auditLog(app, owner.accessToken);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUDIT_UNAVAILABLE');
  });

  it('queues entries in PostgreSQL while the store is down and flushes them later (risk 21)', async () => {
    const store = new FlakyStore();
    const audit = new AuditService({
      store,
      pending: new PrismaPendingAuditQueue(prisma),
      logger,
    });
    const event = createEvent(MEMBER_UPDATED, {
      organization_id: randomUUID(),
      actor_id: randomUUID(),
      subject_id: randomUUID(),
      metadata: { role: 'ADMIN', previous_role: 'MEMBER' },
    });

    await audit.record(event);
    await audit.record(event); // redelivered: still one queued entry
    expect(await audit.flushPending()).toBe(0);
    expect(
      await prisma.pendingAuditEvent.findMany({
        select: { eventId: true, attempts: true, lastError: true },
      }),
    ).toEqual([{ eventId: event.id, attempts: 2, lastError: 'connection refused' }]);

    store.available = true;
    expect(await audit.flushPending()).toBe(1);
    expect(await audit.flushPending()).toBe(0);
    expect(store.entries).toEqual([
      {
        id: event.id,
        organizationId: event.organization_id,
        actorId: event.actor_id,
        action: MEMBER_UPDATED,
        subjectId: event.subject_id,
        metadata: event.metadata,
        occurredAt: new Date(event.timestamp),
      },
    ]);
    expect(await prisma.pendingAuditEvent.count()).toBe(0);
  });
});
