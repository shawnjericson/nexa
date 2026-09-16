import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createTeam } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const post = (token: string, path: string, body: object) =>
  request(app).post(`/api/v1${path}`).set(bearer(token)).send(body);
const get = (token: string, path: string, query: Record<string, string | number> = {}) =>
  request(app).get(`/api/v1${path}`).query(query).set(bearer(token));

let sequence = 0;
const send = (token: string, conversationId: string, content: string) =>
  post(token, `/conversations/${conversationId}/messages`, {
    content,
    client_message_id: `msg-${Date.now()}-${++sequence}`,
  });

type Team = Awaited<ReturnType<typeof createTeam>>;

async function openDirect(team: Team) {
  const res = await post(team.alice.accessToken, '/conversations', {
    type: 'DIRECT',
    user_id: team.bob.user.id,
  });
  return res.body.data as { id: string };
}

const seqs = (res: request.Response) =>
  res.body.data.map((m: { seq: number }) => m.seq) as number[];

describe('sending', () => {
  it('assigns gap-free server sequence numbers, even under concurrency (9.2)', async () => {
    const team = await createTeam(app);
    const dm = await openDirect(team);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        send((i % 2 ? team.alice : team.bob).accessToken, dm.id, `message ${i}`),
      ),
    );

    expect(results.map((res) => res.status)).toEqual(Array(8).fill(201));
    expect(results.map((res) => res.body.data.seq).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('returns the original message when a send is retried (9.1)', async () => {
    const team = await createTeam(app);
    const dm = await openDirect(team);
    const path = `/conversations/${dm.id}/messages`;
    const body = { content: 'only once', client_message_id: 'retry-0001-abcd' };

    const first = await post(team.alice.accessToken, path, body);
    const retries = await Promise.all(
      [1, 2, 3].map(() => post(team.alice.accessToken, path, body)),
    );
    const sameIdOtherSender = await post(team.bob.accessToken, path, body);

    expect(first.status).toBe(201);
    for (const retry of retries) {
      expect(retry.status).toBe(200);
      expect(retry.body.data).toMatchObject({
        id: first.body.data.id,
        seq: 1,
        client_message_id: 'retry-0001-abcd',
      });
    }
    expect(sameIdOtherSender.status).toBe(201);
    expect(sameIdOtherSender.body.data.seq).toBe(2);
    expect(await prisma.message.count({ where: { conversationId: dm.id } })).toBe(2);
  });

  it('rejects replies to another conversation and sends without a client_message_id', async () => {
    const team = await createTeam(app);
    const dm = await openDirect(team);
    const group = (
      await post(team.alice.accessToken, '/conversations', {
        type: 'GROUP',
        name: 'Group',
        member_ids: [team.bob.user.id],
      })
    ).body.data;
    const inGroup = (await send(team.alice.accessToken, group.id, 'in the group')).body.data;

    const reply = await post(team.alice.accessToken, `/conversations/${dm.id}/messages`, {
      content: 'reply',
      client_message_id: 'reply-0001-abcd',
      reply_to_id: inGroup.id,
    });
    const withoutId = await post(team.alice.accessToken, `/conversations/${dm.id}/messages`, {
      content: 'no id',
    });

    expect([reply.status, reply.body.code]).toEqual([404, 'REPLY_TARGET_NOT_FOUND']);
    expect(withoutId.status).toBe(400);
    expect(withoutId.body.details[0].field).toBe('body.client_message_id');
  });
});

describe('history', () => {
  it('pages backwards and syncs forward after a reconnect (9.3)', async () => {
    const team = await createTeam(app);
    const dm = await openDirect(team);
    for (const n of [1, 2, 3, 4, 5]) await send(team.alice.accessToken, dm.id, `m${n}`);
    const path = `/conversations/${dm.id}/messages`;

    const latest = await get(team.bob.accessToken, path, { limit: 2 });
    const older = await get(team.bob.accessToken, path, { limit: 2, before_seq: 4 });
    const catchUp = await get(team.bob.accessToken, path, { after_seq: 3 });
    const both = await get(team.bob.accessToken, path, { after_seq: 1, before_seq: 3 });

    expect(seqs(latest)).toEqual([4, 5]);
    expect(latest.body.pagination.has_more).toBe(true);
    expect(seqs(older)).toEqual([2, 3]);
    expect(seqs(catchUp)).toEqual([4, 5]);
    expect(catchUp.body.pagination.has_more).toBe(false);
    expect(both.status).toBe(400);
  });
});

describe('editing and deleting', () => {
  it('only lets the sender edit, and keeps a tombstone for deleted messages (9.7)', async () => {
    const team = await createTeam(app);
    const dm = await openDirect(team);
    const message = (await send(team.alice.accessToken, dm.id, 'original')).body.data;
    const path = `/api/v1/conversations/${dm.id}/messages/${message.id}`;

    const byBob = await request(app)
      .patch(path)
      .set(bearer(team.bob.accessToken))
      .send({ content: 'hacked' });
    const edited = await request(app)
      .patch(path)
      .set(bearer(team.alice.accessToken))
      .send({ content: 'edited' });
    const removed = await request(app).delete(path).set(bearer(team.alice.accessToken));
    const history = await get(team.bob.accessToken, `/conversations/${dm.id}/messages`);
    const editDeleted = await request(app)
      .patch(path)
      .set(bearer(team.alice.accessToken))
      .send({ content: 'again' });

    expect([byBob.status, byBob.body.code]).toEqual([403, 'MESSAGE_EDIT_FORBIDDEN']);
    expect(edited.body.data).toMatchObject({ content: 'edited', edited_at: expect.any(String) });
    expect(removed.body.data).toMatchObject({ deleted: true, content: null });
    expect(history.body.data).toEqual([
      expect.objectContaining({ id: message.id, seq: 1, deleted: true, content: null }),
    ]);
    expect(editDeleted.status).toBe(404);
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.content).toBe('');
  });

  it('lets group owners delete messages, but nobody else in a direct conversation', async () => {
    const team = await createTeam(app);
    const group = (
      await post(team.alice.accessToken, '/conversations', {
        type: 'GROUP',
        name: 'Group',
        member_ids: [team.bob.user.id],
      })
    ).body.data;
    const dm = await openDirect(team);
    const inGroup = (await send(team.bob.accessToken, group.id, 'moderate me')).body.data;
    const inDm = (await send(team.bob.accessToken, dm.id, 'mine only')).body.data;

    const byGroupOwner = await request(app)
      .delete(`/api/v1/conversations/${group.id}/messages/${inGroup.id}`)
      .set(bearer(team.alice.accessToken));
    const byDmPeer = await request(app)
      .delete(`/api/v1/conversations/${dm.id}/messages/${inDm.id}`)
      .set(bearer(team.alice.accessToken));

    expect(byGroupOwner.status).toBe(200);
    expect([byDmPeer.status, byDmPeer.body.code]).toEqual([403, 'MESSAGE_DELETE_FORBIDDEN']);
  });

  it('closes the window on your own message after 15 minutes, but never for a moderator', async () => {
    const team = await createTeam(app);
    const group = (
      await post(team.alice.accessToken, '/conversations', {
        type: 'GROUP',
        name: 'Group',
        member_ids: [team.bob.user.id],
      })
    ).body.data;
    const dm = await openDirect(team);
    const mine = (await send(team.bob.accessToken, dm.id, 'typed in haste')).body.data;
    const inGroup = (await send(team.bob.accessToken, group.id, 'regrettable')).body.data;
    await prisma.message.updateMany({
      where: { id: { in: [mine.id, inGroup.id] } },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });

    const path = `/api/v1/conversations/${dm.id}/messages/${mine.id}`;
    const edited = await request(app)
      .patch(path)
      .set(bearer(team.bob.accessToken))
      .send({ content: 'second thoughts' });
    const removed = await request(app).delete(path).set(bearer(team.bob.accessToken));
    const moderated = await request(app)
      .delete(`/api/v1/conversations/${group.id}/messages/${inGroup.id}`)
      .set(bearer(team.alice.accessToken));

    expect([edited.status, edited.body.code]).toEqual([403, 'MESSAGE_CHANGE_WINDOW_EXPIRED']);
    expect([removed.status, removed.body.code]).toEqual([403, 'MESSAGE_CHANGE_WINDOW_EXPIRED']);
    expect(moderated.status).toBe(200);
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: mine.id } });
    expect([stored.content, stored.editedAt, stored.deletedAt]).toEqual([
      'typed in haste',
      null,
      null,
    ]);
  });
});

describe('read state', () => {
  it('only moves forward and never past the last message (9.6)', async () => {
    const team = await createTeam(app);
    const dm = await openDirect(team);
    for (const n of [1, 2, 3]) await send(team.alice.accessToken, dm.id, `m${n}`);
    const read = (seq: number) =>
      post(team.bob.accessToken, `/conversations/${dm.id}/read`, { seq });

    const upTo3 = await read(3);
    const backTo1 = await read(1);
    const beyond = await read(99);

    expect(upTo3.body.data.last_read_seq).toBe(3);
    expect(backTo1.body.data.last_read_seq).toBe(3);
    expect(beyond.body.data.last_read_seq).toBe(3);
    const sender = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: dm.id, userId: team.alice.user.id } },
    });
    expect(sender.lastReadSeq).toBe(3);
  });
});
