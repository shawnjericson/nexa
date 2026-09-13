import { createStore } from '@/lib/external-store';

/** A message the person sent that the server hasn't confirmed yet (spec §7: sending -> sent/failed). */
export interface PendingMessage {
  /** Also the client_message_id: resending with it never creates a duplicate (ADR-015). */
  clientId: string;
  conversationId: string;
  content: string;
  attachmentIds: string[];
  attachmentNames: string[];
  status: 'sending' | 'failed';
  createdAt: string;
}

export const EMPTY_PENDING: PendingMessage[] = [];

export const pendingStore = createStore<Record<string, PendingMessage[]>>({});

export function upsertPending(message: PendingMessage): void {
  pendingStore.set((state) => {
    const list = state[message.conversationId] ?? EMPTY_PENDING;
    const index = list.findIndex((item) => item.clientId === message.clientId);
    const next =
      index >= 0 ? list.map((item, i) => (i === index ? message : item)) : [...list, message];
    return { ...state, [message.conversationId]: next };
  });
}

export function removePending(conversationId: string, clientId: string): void {
  pendingStore.set((state) => {
    const list = state[conversationId];
    if (!list?.some((item) => item.clientId === clientId)) return state;
    return { ...state, [conversationId]: list.filter((item) => item.clientId !== clientId) };
  });
}

/** How long a typing signal lasts without a refresh from the typist. */
const TYPING_TTL_MS = 6_000;

export const EMPTY_TYPING: Record<string, number> = {};

/** conversationId -> userId -> expiry time. */
export const typingStore = createStore<Record<string, Record<string, number>>>({});

export function setTyping(conversationId: string, userId: string, typing: boolean): void {
  typingStore.set((state) => {
    const current = { ...(state[conversationId] ?? EMPTY_TYPING) };
    if (typing) current[userId] = Date.now() + TYPING_TTL_MS;
    else if (userId in current) delete current[userId];
    else return state;
    return { ...state, [conversationId]: current };
  });
}

/** Drops typing signals that expired (a typist who closed the tab never sends "stopped"). */
export function sweepTyping(): void {
  const now = Date.now();
  typingStore.set((state) => {
    let changed = false;
    const next: Record<string, Record<string, number>> = {};
    for (const [conversationId, users] of Object.entries(state)) {
      const kept = Object.fromEntries(Object.entries(users).filter(([, expiry]) => expiry > now));
      if (Object.keys(kept).length !== Object.keys(users).length) changed = true;
      next[conversationId] = Object.keys(kept).length === Object.keys(users).length ? users : kept;
    }
    return changed ? next : state;
  });
}

/** The conversation on screen, so messages arriving there don't count as unread. */
export const activeConversationStore = createStore<string | null>(null);

/** Unsent drafts per conversation, in memory only (spec §17: never in localStorage). */
export const drafts = new Map<string, string>();
