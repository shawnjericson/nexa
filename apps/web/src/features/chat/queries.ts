import { unwrap, unwrapBody } from '@nexa/api-client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';
import type { ConversationDetails, ConversationSummary, Message } from '@/lib/chat-types';
import { removePending, upsertPending, type PendingMessage } from './stores';

type OrgKey = ReturnType<typeof useOrgKey>;

interface ConversationPage {
  data: ConversationSummary[];
  pagination: { next_cursor: string | null; has_next: boolean; limit: number };
}

/** The loaded part of a conversation's history, ascending by seq. */
export interface MessageWindow {
  messages: Message[];
  hasOlder: boolean;
}

const LIST_PAGE_SIZE = 50;
const HISTORY_PAGE_SIZE = 50;
const CATCH_UP_PAGE_SIZE = 100;

const isMessage = (message: Message | null | undefined): message is Message => Boolean(message);

/**
 * The OpenAPI document marks Message nullable (a conversation may have no last message), but
 * the message endpoints always return one.
 */
async function messageOf(request: Promise<Message | null>): Promise<Message> {
  const message = await request;
  if (!message) throw new TypeError('The server returned no message');
  return message;
}

/** Server messages by id (a newer copy wins), in server order. */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

async function fetchHistory(
  id: string,
  query: { before_seq?: number; after_seq?: number; limit: number },
) {
  const body = await unwrapBody(
    api.GET('/api/v1/conversations/{id}/messages', { params: { path: { id }, query } }),
  );
  return { messages: body.data.filter(isMessage), hasMore: body.pagination.has_more };
}

export function useConversations() {
  const orgKey = useOrgKey();
  return useInfiniteQuery({
    queryKey: orgKey('conversations'),
    queryFn: ({ pageParam }): Promise<ConversationPage> =>
      unwrapBody(
        api.GET('/api/v1/conversations', {
          params: { query: { limit: LIST_PAGE_SIZE, ...(pageParam && { cursor: pageParam }) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.next_cursor,
  });
}

export function useConversation(id: string) {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('conversation', id),
    queryFn: () => unwrap(api.GET('/api/v1/conversations/{id}', { params: { path: { id } } })),
  });
}

/** Newest page first; kept current by realtime events and catch-up after reconnects. */
export function useMessages(id: string, enabled: boolean) {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('messages', id),
    queryFn: async (): Promise<MessageWindow> => {
      const page = await fetchHistory(id, { limit: HISTORY_PAGE_SIZE });
      return { messages: page.messages, hasOlder: page.hasMore };
    },
    enabled,
    staleTime: Infinity,
  });
}

export function useLoadOlder(id: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useCallback(async () => {
    const key = orgKey('messages', id);
    const current = queryClient.getQueryData<MessageWindow>(key);
    const first = current?.messages[0];
    if (!current?.hasOlder || !first) return;
    const page = await fetchHistory(id, { before_seq: first.seq, limit: HISTORY_PAGE_SIZE });
    queryClient.setQueryData<MessageWindow>(key, (data) =>
      data
        ? { messages: mergeMessages(data.messages, page.messages), hasOlder: page.hasMore }
        : data,
    );
  }, [queryClient, orgKey, id]);
}

/**
 * After a reconnect (spec §7): everything newer than what the client has, then the newest page
 * again so edits and deletions made meanwhile show up too.
 */
export async function resyncMessages(
  queryClient: QueryClient,
  key: readonly unknown[],
  id: string,
): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    const last = queryClient.getQueryData<MessageWindow>(key)?.messages.at(-1);
    if (!last) break;
    const page = await fetchHistory(id, { after_seq: last.seq, limit: CATCH_UP_PAGE_SIZE });
    queryClient.setQueryData<MessageWindow>(key, (data) =>
      data ? { ...data, messages: mergeMessages(data.messages, page.messages) } : data,
    );
    if (!page.hasMore) break;
  }
  const newest = await fetchHistory(id, { limit: HISTORY_PAGE_SIZE });
  queryClient.setQueryData<MessageWindow>(key, (data) =>
    data ? { ...data, messages: mergeMessages(data.messages, newest.messages) } : data,
  );
}

/** Updates one conversation in the list; returns whether it was there. */
function updateConversationList(
  queryClient: QueryClient,
  orgKey: OrgKey,
  id: string,
  update: (item: ConversationSummary) => ConversationSummary | null,
  moveToTop = false,
): boolean {
  let found = false;
  queryClient.setQueryData<InfiniteData<ConversationPage>>(orgKey('conversations'), (data) => {
    if (!data) return data;
    const moved: ConversationSummary[] = [];
    const pages = data.pages.map((page) => ({
      ...page,
      data: page.data.flatMap((item) => {
        if (item.id !== id) return [item];
        found = true;
        const next = update(item);
        if (!next) return [];
        if (moveToTop) {
          moved.push(next);
          return [];
        }
        return [next];
      }),
    }));
    const [first, ...rest] = pages;
    return first
      ? { ...data, pages: [{ ...first, data: [...moved, ...first.data] }, ...rest] }
      : data;
  });
  return found;
}

/** A new message, from the API or a realtime event: history, list preview and unread count. */
export function applyNewMessage(
  queryClient: QueryClient,
  orgKey: OrgKey,
  message: Message,
  { fromMe, active }: { fromMe: boolean; active: boolean },
): void {
  queryClient.setQueryData<MessageWindow>(orgKey('messages', message.conversation_id), (data) =>
    data ? { ...data, messages: mergeMessages(data.messages, [message]) } : data,
  );
  const known = updateConversationList(
    queryClient,
    orgKey,
    message.conversation_id,
    (item) =>
      message.seq <= item.last_message_seq
        ? item
        : {
            ...item,
            last_message: message,
            last_message_seq: message.seq,
            last_message_at: message.created_at,
            last_read_seq: fromMe ? message.seq : item.last_read_seq,
            unread_count: fromMe ? 0 : active ? item.unread_count : item.unread_count + 1,
          },
    true,
  );
  if (!known) void queryClient.invalidateQueries({ queryKey: orgKey('conversations') });
  void queryClient.invalidateQueries({ queryKey: orgKey('conversations', 'briefing') });
}

/** An edited or deleted message (deletions arrive as tombstones). */
export function applyChangedMessage(
  queryClient: QueryClient,
  orgKey: OrgKey,
  message: Message,
): void {
  queryClient.setQueryData<MessageWindow>(orgKey('messages', message.conversation_id), (data) =>
    data ? { ...data, messages: mergeMessages(data.messages, [message]) } : data,
  );
  updateConversationList(queryClient, orgKey, message.conversation_id, (item) =>
    item.last_message?.id === message.id ? { ...item, last_message: message } : item,
  );
}

/** The person left or was removed: drop everything cached about the conversation. */
export function forgetConversation(queryClient: QueryClient, orgKey: OrgKey, id: string): void {
  updateConversationList(queryClient, orgKey, id, () => null);
  queryClient.removeQueries({ queryKey: orgKey('messages', id) });
  void queryClient.invalidateQueries({ queryKey: orgKey('conversation', id) });
  void queryClient.invalidateQueries({ queryKey: orgKey('channels') });
}

/** Sends (or resends) a pending message; failures stay visible with a retry (spec §7). */
export function useSendMessage(id: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useCallback(
    async (pending: PendingMessage) => {
      upsertPending({ ...pending, status: 'sending' });
      try {
        const message = await messageOf(
          unwrap(
            api.POST('/api/v1/conversations/{id}/messages', {
              params: { path: { id } },
              body: {
                content: pending.content,
                client_message_id: pending.clientId,
                attachment_ids: pending.attachmentIds,
              },
            }),
          ),
        );
        applyNewMessage(queryClient, orgKey, message, { fromMe: true, active: true });
        removePending(id, pending.clientId);
      } catch (error) {
        upsertPending({ ...pending, status: 'failed' });
        throw error;
      }
    },
    [queryClient, orgKey, id],
  );
}

export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      messageOf(
        unwrap(
          api.PATCH('/api/v1/conversations/{id}/messages/{messageId}', {
            params: { path: { id: conversationId, messageId } },
            body: { content },
          }),
        ),
      ),
    onSuccess: (message) => applyChangedMessage(queryClient, orgKey, message),
  });
}

export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: (messageId: string) =>
      messageOf(
        unwrap(
          api.DELETE('/api/v1/conversations/{id}/messages/{messageId}', {
            params: { path: { id: conversationId, messageId } },
          }),
        ),
      ),
    onSuccess: (message) => applyChangedMessage(queryClient, orgKey, message),
  });
}

/** Moves the read position forward (the API never moves it back) and clears the unread count. */
export function useMarkRead(id: string) {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useCallback(
    async (seq: number) => {
      const result = await unwrap(
        api.POST('/api/v1/conversations/{id}/read', { params: { path: { id } }, body: { seq } }),
      );
      updateConversationList(queryClient, orgKey, id, (item) => ({
        ...item,
        last_read_seq: Math.max(item.last_read_seq, result.last_read_seq),
        unread_count: Math.max(0, item.last_message_seq - result.last_read_seq),
      }));
      void queryClient.invalidateQueries({ queryKey: orgKey('conversations', 'briefing') });
      // The API clears the notification about this conversation; pick that up now rather than
      // leaving a dot on the bell for something the person is looking at.
      void queryClient.invalidateQueries({ queryKey: orgKey('notifications') });
    },
    [queryClient, orgKey, id],
  );
}

function useInvalidateLists() {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return () => {
    void queryClient.invalidateQueries({ queryKey: orgKey('conversations') });
    void queryClient.invalidateQueries({ queryKey: orgKey('channels') });
  };
}

/** Opens the direct conversation with someone, creating it the first time (idempotent). */
export function useOpenDirect() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(api.POST('/api/v1/conversations', { body: { type: 'DIRECT', user_id: userId } })),
    onSuccess: invalidate,
  });
}

export function useCreateGroup() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (input: { name: string; memberIds: string[] }) =>
      unwrap(
        api.POST('/api/v1/conversations', {
          body: { type: 'GROUP', name: input.name, member_ids: input.memberIds },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useCreateChannel() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (input: { name: string; description: string | null }) =>
      unwrap(
        api.POST('/api/v1/conversations', {
          body: { type: 'CHANNEL', name: input.name, description: input.description },
        }),
      ),
    onSuccess: invalidate,
  });
}

/** Joining a channel is adding yourself as a member. */
export function useJoinChannel() {
  const invalidate = useInvalidateLists();
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: string; userId: string }) =>
      unwrap(
        api.POST('/api/v1/conversations/{id}/members', {
          params: { path: { id: conversationId } },
          body: { user_ids: [userId] },
        }),
      ),
    onSuccess: (details: ConversationDetails) => {
      queryClient.setQueryData(orgKey('conversation', details.id), details);
      invalidate();
    },
  });
}

export function useLeaveConversation() {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: string; userId: string }) =>
      unwrap(
        api.DELETE('/api/v1/conversations/{id}/members/{userId}', {
          params: { path: { id: conversationId, userId } },
        }),
      ),
    onSuccess: (_result, { conversationId }) =>
      forgetConversation(queryClient, orgKey, conversationId),
  });
}
