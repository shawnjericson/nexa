import type { Logger } from 'pino';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { RealtimeHub } from '../../../infrastructure/websocket/realtime-hub';
import { organizationRoom, userRoom } from '../../../infrastructure/websocket/rooms';
import { AppError } from '../../../shared/errors/app-error';
import type { Authenticate, UserDirectory } from '../../identity';
import type { ResolveOrganizationContext } from '../../organization';
import type { ChatActor } from '../domain/policies';
import type { ConversationRepository, PresenceStore } from '../domain/ports';

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const PRESENCE_TTL_MS = 75_000;

const TypingPayload = z.object({ conversation_id: z.uuid() });
const OrganizationId = z.uuid();

type Ack = (response: { ok: true } | { ok: false; code: string }) => void;

interface SocketDeps {
  authenticate: Authenticate;
  resolveContext: ResolveOrganizationContext;
  users: UserDirectory;
  conversations: ConversationRepository;
  presence: PresenceStore;
  logger: Logger;
}

/** Errors reach the client as `connect_error` with `err.data.code`. */
function toSocketError(err: unknown): Error {
  const known = err instanceof AppError;
  const error = new Error(known ? err.message : 'Authentication failed') as Error & {
    data?: { code: string };
  };
  error.data = { code: known ? err.code : 'UNAUTHORIZED' };
  return error;
}

/**
 * Handshake: `io(url, { auth: { token, organization_id? } })` - the same access token and
 * organization rules as the REST API. Client -> server events: `typing.start`, `typing.stop`.
 */
export function registerChatSockets(hub: RealtimeHub, deps: SocketDeps): void {
  const { presence, logger } = deps;

  async function authenticateSocket(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as { token?: unknown; organization_id?: unknown };
    if (typeof auth.token !== 'string' || !auth.token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    const context = await deps.authenticate(auth.token);

    const requested =
      typeof auth.organization_id === 'string' && auth.organization_id
        ? auth.organization_id
        : undefined;
    if (requested !== undefined && !OrganizationId.safeParse(requested).success) {
      throw new AppError(400, 'INVALID_ORGANIZATION_ID', 'organization_id must be a UUID');
    }

    const actor: ChatActor = {
      userId: context.userId,
      organization: await deps.resolveContext(context.userId, requested),
    };
    socket.data.actor = actor;
  }

  hub.use((socket, next) => {
    authenticateSocket(socket).then(
      () => next(),
      (err: unknown) => next(toSocketError(err)),
    );
  });

  hub.onConnection((socket) => {
    const actor = socket.data.actor as ChatActor;
    const organizationId = actor.organization.organizationId;
    const log = logger.child({ socket_id: socket.id, user_id: actor.userId });

    void socket.join([organizationRoom(organizationId), userRoom(organizationId, actor.userId)]);

    const announce = (status: 'online' | 'offline') =>
      hub.emit(organizationRoom(organizationId), 'presence.updated', {
        user_id: actor.userId,
        status,
      });

    presence
      .connect(organizationId, actor.userId, socket.id, PRESENCE_TTL_MS)
      .then((cameOnline) => cameOnline && announce('online'))
      .catch((err: unknown) => log.warn({ err }, 'Presence connect failed'));

    // A token is only checked at the handshake, but a socket can live for hours: re-check the
    // membership and account on every heartbeat (risk register 4.3).
    async function heartbeat() {
      try {
        await deps.resolveContext(actor.userId, organizationId);
        const user = (await deps.users.getSummaries([actor.userId])).get(actor.userId);
        if (!user || user.status !== 'ACTIVE') throw new Error('Account deactivated');
      } catch {
        socket.disconnect(true);
        return;
      }
      await presence.heartbeat(organizationId, actor.userId, socket.id, PRESENCE_TTL_MS);
    }
    const timer = setInterval(() => {
      heartbeat().catch((err: unknown) => log.warn({ err }, 'Heartbeat failed'));
    }, HEARTBEAT_INTERVAL_MS);
    timer.unref();

    async function typing(started: boolean, payload: unknown, ack?: Ack) {
      const reply = (response: Parameters<Ack>[0]) => {
        if (typeof ack === 'function') ack(response);
      };
      const parsed = TypingPayload.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, code: 'VALIDATION_ERROR' });

      const conversationId = parsed.data.conversation_id;
      const conversation = await deps.conversations.findById(organizationId, conversationId);
      const membership =
        conversation && (await deps.conversations.findMembership(conversationId, actor.userId));
      if (!membership) return reply({ ok: false, code: 'CONVERSATION_NOT_FOUND' });

      const others = (await deps.conversations.listMemberIds(conversationId)).filter(
        (userId) => userId !== actor.userId,
      );
      hub.emit(
        others.map((userId) => userRoom(organizationId, userId)),
        started ? 'typing.started' : 'typing.stopped',
        { conversation_id: conversationId, user_id: actor.userId },
      );
      reply({ ok: true });
    }

    socket.on('typing.start', (payload: unknown, ack?: Ack) => {
      typing(true, payload, ack).catch((err: unknown) => log.warn({ err }, 'typing.start failed'));
    });
    socket.on('typing.stop', (payload: unknown, ack?: Ack) => {
      typing(false, payload, ack).catch((err: unknown) => log.warn({ err }, 'typing.stop failed'));
    });

    socket.on('disconnect', () => {
      clearInterval(timer);
      presence
        .disconnect(organizationId, actor.userId, socket.id)
        .then((wentOffline) => wentOffline && announce('offline'))
        .catch((err: unknown) => log.warn({ err }, 'Presence disconnect failed'));
    });
  });
}
