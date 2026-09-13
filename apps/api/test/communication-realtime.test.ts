import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bearer } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import {
  nextEvent,
  recordEvents,
  sleep,
  startRealtimeServer,
  type RealtimeServer,
} from './helpers/realtime';
import { createTeam } from './helpers/team';

let server: RealtimeServer;

beforeEach(async () => {
  await resetDatabase();
  server = await startRealtimeServer();
});
afterEach(() => server.close());
afterAll(() => prisma.$disconnect());

const post = (token: string, path: string, body: object) =>
  request(server.app).post(`/api/v1${path}`).set(bearer(token)).send(body);

let sequence = 0;
const send = (token: string, conversationId: string, content: string) =>
  post(token, `/conversations/${conversationId}/messages`, {
    content,
    client_message_id: `rt-${Date.now()}-${++sequence}`,
  });

async function openDirect(from: { accessToken: string }, to: { user: { id: string } }) {
  const res = await post(from.accessToken, '/conversations', {
    type: 'DIRECT',
    user_id: to.user.id,
  });
  return res.body.data as { id: string };
}

describe('realtime chat', () => {
  it('rejects connections without a valid access token', async () => {
    await expect(server.connect('not-a-token')).rejects.toMatchObject({
      data: { code: 'INVALID_TOKEN' },
    });
    await expect(server.connect('')).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
  });

  it('delivers new messages to every device of every member, and to nobody else', async () => {
    const { owner, alice, bob } = await createTeam(server.app);
    const dm = await openDirect(alice, bob);
    const [bobPhone, bobLaptop, ownerSocket] = await Promise.all([
      server.connect(bob.accessToken),
      server.connect(bob.accessToken),
      server.connect(owner.accessToken),
    ]);
    const ownerSaw = recordEvents(ownerSocket, 'message.created');
    const onPhone = nextEvent(bobPhone, 'message.created');
    const onLaptop = nextEvent(bobLaptop, 'message.created');

    await send(alice.accessToken, dm.id, 'xin chào');

    for (const payload of await Promise.all([onPhone, onLaptop])) {
      expect(payload).toMatchObject({
        conversation_id: dm.id,
        seq: 1,
        content: 'xin chào',
        sender: { id: alice.user.id },
      });
    }
    await sleep(300);
    expect(ownerSaw).toEqual([]);
  });

  it('stops delivering to someone removed from the conversation', async () => {
    const { alice, bob } = await createTeam(server.app);
    const group = (
      await post(alice.accessToken, '/conversations', {
        type: 'GROUP',
        name: 'Group',
        member_ids: [bob.user.id],
      })
    ).body.data;
    const bobSocket = await server.connect(bob.accessToken);
    const removal = nextEvent(bobSocket, 'conversation.members_changed');

    await request(server.app)
      .delete(`/api/v1/conversations/${group.id}/members/${bob.user.id}`)
      .set(bearer(alice.accessToken));
    expect(await removal).toMatchObject({ conversation_id: group.id, removed: [bob.user.id] });

    const bobSaw = recordEvents(bobSocket, 'message.created');
    await send(alice.accessToken, group.id, 'after the removal');
    await sleep(300);
    expect(bobSaw).toEqual([]);
  });

  it('shows typing to the other members only', async () => {
    const { alice, bob } = await createTeam(server.app);
    const dm = await openDirect(alice, bob);
    const [aliceSocket, bobSocket] = await Promise.all([
      server.connect(alice.accessToken),
      server.connect(bob.accessToken),
    ]);
    const aliceSaw = recordEvents(aliceSocket, 'typing.started');
    const bobSees = nextEvent(bobSocket, 'typing.started');

    const ack = await aliceSocket.emitWithAck('typing.start', { conversation_id: dm.id });
    const denied = await bobSocket.emitWithAck('typing.start', {
      conversation_id: '0190f5a4-0000-7000-8000-000000000000',
    });

    expect(ack).toEqual({ ok: true });
    expect(await bobSees).toEqual({ conversation_id: dm.id, user_id: alice.user.id });
    expect(denied).toEqual({ ok: false, code: 'CONVERSATION_NOT_FOUND' });
    await sleep(200);
    expect(aliceSaw).toEqual([]);
  });

  it('keeps someone online while any of their devices is connected (9.5)', async () => {
    const { owner, bob } = await createTeam(server.app);
    const watcher = await server.connect(owner.accessToken);
    const updates = recordEvents<{ user_id: string; status: string }>(watcher, 'presence.updated');
    const presenceOfBob = async () =>
      (
        await request(server.app)
          .get('/api/v1/presence')
          .query({ user_ids: bob.user.id })
          .set(bearer(owner.accessToken))
      ).body.data[bob.user.id];

    const phone = await server.connect(bob.accessToken);
    const laptop = await server.connect(bob.accessToken);
    await sleep(300);
    phone.disconnect();
    await sleep(300);
    const withLaptopOpen = await presenceOfBob();
    laptop.disconnect();
    await sleep(300);

    expect(withLaptopOpen).toBe('online');
    expect(await presenceOfBob()).toBe('offline');
    expect(updates.filter((u) => u.user_id === bob.user.id).map((u) => u.status)).toEqual([
      'online',
      'offline',
    ]);
  });

  it('announces read positions to the other members', async () => {
    const { alice, bob } = await createTeam(server.app);
    const dm = await openDirect(alice, bob);
    await send(alice.accessToken, dm.id, 'did you read this?');
    const aliceSocket = await server.connect(alice.accessToken);
    const readEvent = nextEvent(aliceSocket, 'message.read');

    await post(bob.accessToken, `/conversations/${dm.id}/read`, { seq: 1 });

    expect(await readEvent).toEqual({
      conversation_id: dm.id,
      user_id: bob.user.id,
      last_read_seq: 1,
    });
  });
});
