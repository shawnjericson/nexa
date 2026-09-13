'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import {
  applyChangedMessage,
  applyNewMessage,
  forgetConversation,
  resyncMessages,
} from '@/features/chat/queries';
import {
  activeConversationStore,
  removePending,
  setTyping,
  sweepTyping,
} from '@/features/chat/stores';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import type { ConversationDetails, Message } from '@/lib/chat-types';
import { connectRealtime, type ConnectionStatus } from '@/lib/realtime/connection';

type OrgKey = ReturnType<typeof useOrgKey>;

interface RealtimeContextValue {
  status: ConnectionStatus;
  socket: Socket | null;
}

const RealtimeContext = createContext<RealtimeContextValue>({ status: 'connecting', socket: null });

interface ReadEvent {
  conversation_id: string;
  user_id: string;
  last_read_seq: number;
}
interface TypingEvent {
  conversation_id: string;
  user_id: string;
}
interface MembersEvent {
  conversation_id: string;
  added: string[];
  removed: string[];
}

/** Realtime event -> cache reconciliation -> UI (spec §12). */
function listen(socket: Socket, queryClient: QueryClient, orgKey: OrgKey, onReconnect: () => void) {
  const meId = () => queryClient.getQueryData<{ id: string }>(['me'])?.id;

  socket.on('message.created', (message: Message) => {
    const fromMe = message.sender?.id === meId();
    if (fromMe && message.client_message_id) {
      removePending(message.conversation_id, message.client_message_id);
    }
    applyNewMessage(queryClient, orgKey, message, {
      fromMe,
      active: activeConversationStore.get() === message.conversation_id,
    });
  });
  socket.on('message.updated', (message: Message) =>
    applyChangedMessage(queryClient, orgKey, message),
  );
  socket.on('message.deleted', (message: Message) =>
    applyChangedMessage(queryClient, orgKey, message),
  );

  socket.on('message.read', (event: ReadEvent) => {
    queryClient.setQueryData<ConversationDetails>(
      orgKey('conversation', event.conversation_id),
      (data) =>
        data
          ? {
              ...data,
              members: data.members.map((member) =>
                member.user?.id === event.user_id
                  ? {
                      ...member,
                      last_read_seq: Math.max(member.last_read_seq, event.last_read_seq),
                    }
                  : member,
              ),
            }
          : data,
    );
  });

  socket.on('typing.started', (event: TypingEvent) =>
    setTyping(event.conversation_id, event.user_id, true),
  );
  socket.on('typing.stopped', (event: TypingEvent) =>
    setTyping(event.conversation_id, event.user_id, false),
  );

  socket.on('presence.updated', (event: { user_id: string; status: string }) => {
    queryClient.setQueriesData<Record<string, string>>({ queryKey: orgKey('presence') }, (data) =>
      data && event.user_id in data ? { ...data, [event.user_id]: event.status } : data,
    );
  });

  socket.on('conversation.members_changed', (event: MembersEvent) => {
    const me = meId();
    if (me && event.removed.includes(me)) {
      forgetConversation(queryClient, orgKey, event.conversation_id);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: orgKey('conversation', event.conversation_id) });
    void queryClient.invalidateQueries({ queryKey: orgKey('conversations') });
    void queryClient.invalidateQueries({ queryKey: orgKey('channels') });
  });

  socket.on('notification.created', () => {
    void queryClient.invalidateQueries({ queryKey: orgKey('notifications') });
  });

  let connectedBefore = false;
  socket.on('connect', () => {
    if (connectedBefore) onReconnect();
    connectedBefore = true;
  });
}

/** After a reconnect: authenticate -> resubscribe (automatic) -> synchronize missed events (§7). */
async function resync(queryClient: QueryClient, orgKey: OrgKey) {
  void queryClient.invalidateQueries({ queryKey: orgKey('conversations') });
  void queryClient.invalidateQueries({ queryKey: orgKey('notifications') });
  void queryClient.invalidateQueries({ queryKey: orgKey('presence') });
  for (const [key] of queryClient.getQueriesData({ queryKey: orgKey('messages') })) {
    const id = key[3];
    if (typeof id === 'string') await resyncMessages(queryClient, key, id).catch(() => undefined);
  }
}

/** One realtime connection per organization; switching organization reconnects (spec §17). */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { organization } = useOrganization();
  const orgKey = useOrgKey();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const connection = connectRealtime(organization.id, setStatus);
    listen(connection, queryClient, orgKey, () => void resync(queryClient, orgKey));
    setSocket(connection);
    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      setSocket(null);
    };
  }, [organization.id, queryClient, orgKey]);

  useEffect(() => {
    const timer = setInterval(sweepTyping, 2_000);
    return () => clearInterval(timer);
  }, []);

  return <RealtimeContext.Provider value={{ status, socket }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/**
 * Non-blocking connection state (spec §7: offline/reconnecting). Shown only after the first
 * connection, so a normal page load never flashes it.
 */
export function ConnectionBanner() {
  const { t } = useI18n();
  const { status } = useRealtime();
  const connectedOnce = useRef(false);
  if (status === 'connected') connectedOnce.current = true;
  const visible = connectedOnce.current && (status === 'reconnecting' || status === 'offline');
  if (!visible) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border bg-warning-soft px-4 py-1.5 text-xs text-warning"
    >
      <WifiOff className="size-3.5" aria-hidden />
      {t('chat.offlineBanner')}
    </div>
  );
}
