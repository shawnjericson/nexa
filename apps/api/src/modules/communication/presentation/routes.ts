import { Router, type Request, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { ok, paginated } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { decodeKeyset, encodeKeyset } from '../../../shared/utils/cursor';
import type { FileDirectory } from '../../file';
import { requireAuthContext, type UserDirectory } from '../../identity';
import { organizationContext } from '../../organization';
import type { ConversationService } from '../application/conversation.service';
import type { MessageService } from '../application/message.service';
import type { Conversation, Message } from '../domain/conversation';
import type { ChatActor } from '../domain/policies';
import type { PresenceStore } from '../domain/ports';
import {
  toChannelResponse,
  toConversationDetailsResponse,
  toConversationSummaryResponse,
  toMessageResponse,
} from './dto';
import {
  AddMembersBody,
  ConversationListQuery,
  ConversationMemberParams,
  ConversationParams,
  CreateConversationBody,
  EditMessageBody,
  HistoryQuery,
  MarkReadBody,
  MessageParams,
  PresenceQuery,
  SendMessageBody,
  UpdateConversationBody,
  type AddMembersInput,
  type ConversationListQueryInput,
  type CreateConversationInput,
  type EditMessageInput,
  type HistoryQueryInput,
  type MarkReadInput,
  type PresenceQueryInput,
  type SendMessageInput,
  type UpdateConversationInput,
} from './schemas';

/** Chat endpoints, mounted under /api/v1. Messages are created here; delivery is realtime. */
export function createCommunicationRouter(deps: {
  conversations: ConversationService;
  messages: MessageService;
  presence: PresenceStore;
  users: UserDirectory;
  /** Shows attachments; access follows conversation membership. */
  files: FileDirectory;
  /** requireAuth + requireOrganization, applied per route so unknown paths still 404. */
  guard: RequestHandler[];
}): Router {
  const { conversations, messages, presence, users, files, guard } = deps;
  const createLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });
  const sendLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 });

  const actorOf = (req: Request): ChatActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });
  const paramsOf = <T>(req: Request) => req.params as T;
  const usersOf = (ids: Array<string | null | undefined>) =>
    users.getSummaries(ids.filter((id): id is string => Boolean(id)));
  // Deleted messages show no attachments, so their files are not even looked up.
  const filesOf = (actor: ChatActor, items: Array<Message | null | undefined>) =>
    files.describe(
      actor.organization.organizationId,
      items.flatMap((message) => (message && !message.deletedAt ? message.attachmentIds : [])),
    );

  async function presentMessages(actor: ChatActor, items: Message[]) {
    const [directory, attachments] = await Promise.all([
      usersOf(items.map((message) => message.senderId)),
      filesOf(actor, items),
    ]);
    return items.map((message) => toMessageResponse(message, directory, attachments));
  }

  async function respondWithDetails(
    req: Request,
    res: Parameters<RequestHandler>[1],
    id: string,
    status = 200,
  ) {
    const details = await conversations.get(actorOf(req), id);
    const directory = await usersOf(details.members.map((member) => member.userId));
    ok(res, toConversationDetailsResponse(details, directory), status);
  }

  // ─── Conversations ─────────────────────────────────────────────────────

  const listConversations: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const query = req.query as unknown as ConversationListQueryInput;
    const cursor = query.cursor ? decodeKeyset(query.cursor) : undefined;
    const page = await conversations.list(actor, {
      limit: query.limit,
      after: cursor && { lastActivityAt: cursor.at, id: cursor.id },
    });
    const [directory, attachments] = await Promise.all([
      usersOf(page.items.flatMap((item) => [item.directPeerId, item.lastMessage?.senderId])),
      filesOf(
        actor,
        page.items.map((item) => item.lastMessage),
      ),
    ]);
    const last = page.items.at(-1)?.conversation;
    paginated(
      res,
      page.items.map((item) => toConversationSummaryResponse(item, directory, attachments)),
      {
        next_cursor:
          page.hasMore && last ? encodeKeyset({ at: last.lastActivityAt, id: last.id }) : null,
        has_next: page.hasMore,
        limit: query.limit,
      },
    );
  };

  const createConversation: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as CreateConversationInput;
    let conversation: Conversation;
    let created = true;
    if (body.type === 'DIRECT') {
      ({ conversation, created } = await conversations.openDirect(actor, body.user_id));
    } else if (body.type === 'GROUP') {
      conversation = await conversations.createGroup(actor, {
        name: body.name,
        memberIds: body.member_ids,
      });
    } else {
      conversation = await conversations.createChannel(actor, {
        name: body.name,
        description: body.description,
      });
    }
    await respondWithDetails(req, res, conversation.id, created ? 201 : 200);
  };

  const getConversation: RequestHandler = async (req, res) => {
    await respondWithDetails(req, res, paramsOf<{ id: string }>(req).id);
  };

  const updateConversation: RequestHandler = async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await conversations.update(actorOf(req), id, req.body as UpdateConversationInput);
    await respondWithDetails(req, res, id);
  };

  const addMembers: RequestHandler = async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await conversations.addMembers(actorOf(req), id, (req.body as AddMembersInput).user_ids);
    await respondWithDetails(req, res, id);
  };

  const removeMember: RequestHandler = async (req, res) => {
    const { id, userId } = paramsOf<{ id: string; userId: string }>(req);
    await conversations.removeMember(actorOf(req), id, userId);
    ok(res, { conversation_id: id, user_id: userId, removed: true });
  };

  const listChannels: RequestHandler = async (req, res) => {
    ok(res, (await conversations.browseChannels(actorOf(req))).map(toChannelResponse));
  };

  // ─── Messages ──────────────────────────────────────────────────────────

  const history: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const query = req.query as unknown as HistoryQueryInput;
    const page = await messages.history(actor, paramsOf<{ id: string }>(req).id, {
      beforeSeq: query.before_seq,
      afterSeq: query.after_seq,
      limit: query.limit,
    });
    paginated(res, await presentMessages(actor, page.items), {
      has_more: page.hasMore,
      limit: query.limit,
    });
  };

  const sendMessage: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as SendMessageInput;
    const { message, created } = await messages.send(actor, paramsOf<{ id: string }>(req).id, {
      content: body.content,
      clientMessageId: body.client_message_id,
      replyToId: body.reply_to_id,
      attachmentIds: body.attachment_ids,
    });
    const [response] = await presentMessages(actor, [message]);
    // 201 for a new message, 200 when a retry returned the original one.
    ok(res, response, created ? 201 : 200);
  };

  const editMessage: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const { id, messageId } = paramsOf<{ id: string; messageId: string }>(req);
    const message = await messages.edit(
      actor,
      id,
      messageId,
      (req.body as EditMessageInput).content,
    );
    const [response] = await presentMessages(actor, [message]);
    ok(res, response);
  };

  const deleteMessage: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const { id, messageId } = paramsOf<{ id: string; messageId: string }>(req);
    const message = await messages.delete(actor, id, messageId);
    const [response] = await presentMessages(actor, [message]);
    ok(res, response);
  };

  const markRead: RequestHandler = async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const lastReadSeq = await conversations.markRead(
      actorOf(req),
      id,
      (req.body as MarkReadInput).seq,
    );
    ok(res, { conversation_id: id, last_read_seq: lastReadSeq });
  };

  // ─── Presence ──────────────────────────────────────────────────────────

  const getPresence: RequestHandler = async (req, res) => {
    const { user_ids: userIds } = req.query as unknown as PresenceQueryInput;
    const online = await presence.onlineUserIds(actorOf(req).organization.organizationId, userIds);
    ok(res, Object.fromEntries(userIds.map((id) => [id, online.has(id) ? 'online' : 'offline'])));
  };

  const router = Router();
  const conversation = '/conversations/:id';

  router.get(
    '/conversations',
    ...guard,
    validate({ query: ConversationListQuery }),
    listConversations,
  );
  router.post(
    '/conversations',
    createLimiter,
    ...guard,
    validate({ body: CreateConversationBody }),
    createConversation,
  );
  router.get(conversation, ...guard, validate({ params: ConversationParams }), getConversation);
  router.patch(
    conversation,
    ...guard,
    validate({ params: ConversationParams, body: UpdateConversationBody }),
    updateConversation,
  );
  router.post(
    `${conversation}/members`,
    ...guard,
    validate({ params: ConversationParams, body: AddMembersBody }),
    addMembers,
  );
  router.delete(
    `${conversation}/members/:userId`,
    ...guard,
    validate({ params: ConversationMemberParams }),
    removeMember,
  );
  router.get(
    `${conversation}/messages`,
    ...guard,
    validate({ params: ConversationParams, query: HistoryQuery }),
    history,
  );
  router.post(
    `${conversation}/messages`,
    sendLimiter,
    ...guard,
    validate({ params: ConversationParams, body: SendMessageBody }),
    sendMessage,
  );
  router.patch(
    `${conversation}/messages/:messageId`,
    ...guard,
    validate({ params: MessageParams, body: EditMessageBody }),
    editMessage,
  );
  router.delete(
    `${conversation}/messages/:messageId`,
    ...guard,
    validate({ params: MessageParams }),
    deleteMessage,
  );
  router.post(
    `${conversation}/read`,
    ...guard,
    validate({ params: ConversationParams, body: MarkReadBody }),
    markRead,
  );
  router.get('/channels', ...guard, listChannels);
  router.get('/presence', ...guard, validate({ query: PresenceQuery }), getPresence);

  return router;
}
