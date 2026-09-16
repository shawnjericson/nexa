'use client';

import { ArrowDown, Loader2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { ConversationDetails, Message } from '@/lib/chat-types';
import { MessageItem, PendingItem } from './message-item';
import type { PendingMessage } from './stores';

/** Consecutive messages from one person within this window share a header. */
const GROUP_WINDOW_MS = 5 * 60_000;
/** Distance from the bottom that still counts as "reading the latest messages". */
const BOTTOM_THRESHOLD_PX = 80;
const LOAD_OLDER_THRESHOLD_PX = 150;
const MANAGER_ROLES = new Set(['OWNER', 'ADMIN']);

const dayOf = (iso: string) => new Date(iso).toDateString();

/**
 * The conversation log (spec §7).
 * - Older messages load when scrolling up, and the reading position is kept.
 * - New messages never yank the scroll: when you're reading history, a button counts them.
 * - The unread divider marks where you left off when you opened the conversation.
 */
export function MessageList({
  conversation,
  messages,
  hasOlder,
  loadOlder,
  pending,
  meId,
  meName,
  meAvatar,
  readAtOpen,
  isOrganizationManager,
  onReadUpTo,
  onRetry,
  onDiscard,
}: {
  conversation: ConversationDetails;
  messages: Message[];
  hasOlder: boolean;
  loadOlder(): Promise<void>;
  pending: PendingMessage[];
  meId?: string;
  meName: string;
  meAvatar?: string | null;
  readAtOpen: number | null;
  isOrganizationManager: boolean;
  onReadUpTo(seq: number): void;
  onRetry(pending: PendingMessage): void;
  onDiscard(pending: PendingMessage): void;
}) {
  const { t, tn, formatDate } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const initialized = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const firstId = messages[0]?.id;
  const last = messages.at(-1);
  const lastSeq = last?.seq ?? 0;

  const scrollToBottom = useCallback(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
    setUnseen(0);
  }, []);

  // First render with messages: go to where the person left off, else to the latest message.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (initialized.current || !element || messages.length === 0) return;
    const divider = element.querySelector('[data-unread-divider]');
    if (divider) divider.scrollIntoView({ block: 'center' });
    else element.scrollTop = element.scrollHeight;
    initialized.current = true;
  }, [messages.length]);

  // Older messages were prepended: keep the same messages under the reader's eyes.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !anchor.current) return;
    element.scrollTop = element.scrollHeight - anchor.current.height + anchor.current.top;
    anchor.current = null;
  }, [firstId]);

  // A message was appended: follow it only if the person is at the bottom or sent it.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !initialized.current) return;
    if (atBottom || last?.sender?.id === meId) element.scrollTop = element.scrollHeight;
    else setUnseen((count) => count + 1);
    // Only reacts to new messages at the end (and to the person's own pending sends).
  }, [last?.id, pending.length]);

  // Reading the latest message marks it read, but only while the page is visible.
  useEffect(() => {
    const report = () => {
      if (atBottom && lastSeq > 0 && document.visibilityState === 'visible') onReadUpTo(lastSeq);
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [atBottom, lastSeq, onReadUpTo]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_THRESHOLD_PX;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
    if (element.scrollTop < LOAD_OLDER_THRESHOLD_PX && hasOlder && !loadingOlder) {
      anchor.current = { height: element.scrollHeight, top: element.scrollTop };
      setLoadingOlder(true);
      loadOlder().finally(() => setLoadingOlder(false));
    }
  }

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const dayLabel = (iso: string) => {
    const day = dayOf(iso);
    if (day === today) return t('chat.today');
    if (day === yesterday) return t('chat.yesterday');
    return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const canModerate =
    (conversation.type !== 'DIRECT' && MANAGER_ROLES.has(conversation.my_role ?? '')) ||
    (conversation.type === 'CHANNEL' && isOrganizationManager);
  const firstUnread =
    readAtOpen === null
      ? undefined
      : messages.find((message) => message.seq > readAtOpen && message.sender?.id !== meId);
  // Read receipts sit on the last message you sent: who has read at least that far.
  const lastOwn = [...messages].reverse().find((message) => message.sender?.id === meId);
  const readers = lastOwn
    ? conversation.members.flatMap((member) =>
        member.user && member.user.id !== meId && member.last_read_seq >= lastOwn.seq
          ? [member.user]
          : [],
      )
    : [];

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label={t('chat.title')}
        className="h-full overflow-y-auto px-2 py-4 md:px-4"
      >
        {hasOlder ? (
          <div className="flex h-8 items-center justify-center">
            {loadingOlder && (
              <Loader2
                className="size-4 animate-spin text-muted"
                aria-label={t('chat.loadOlder')}
              />
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted">{t('chat.beginning')}</p>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || dayOf(previous.created_at) !== dayOf(message.created_at);
          const unreadDivider = firstUnread?.id === message.id;
          const showHeader =
            newDay ||
            unreadDivider ||
            !previous ||
            previous.deleted !== message.deleted ||
            previous.sender?.id !== message.sender?.id ||
            new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() >
              GROUP_WINDOW_MS;
          const mine = message.sender?.id === meId;
          return (
            <Fragment key={message.id}>
              {newDay && (
                <div className="my-4 flex items-center gap-3 px-2" role="separator">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted">
                    {dayLabel(message.created_at)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              {unreadDivider && (
                <div
                  data-unread-divider
                  className="my-3 flex items-center gap-3 px-2"
                  role="separator"
                >
                  <span className="h-px flex-1 bg-danger/40" />
                  <span className="text-[11px] font-semibold text-danger">
                    {t('chat.unreadDivider')}
                  </span>
                  <span className="h-px flex-1 bg-danger/40" />
                </div>
              )}
              <MessageItem
                message={message}
                conversationId={conversation.id}
                showHeader={showHeader}
                canEdit={mine && message.type === 'TEXT'}
                canDelete={mine || canModerate}
                readers={message.id === lastOwn?.id ? readers : undefined}
              />
            </Fragment>
          );
        })}

        {pending.map((item, index) => (
          <PendingItem
            key={item.clientId}
            pending={item}
            senderName={meName}
            senderAvatar={meAvatar}
            showHeader={index === 0 && last?.sender?.id !== meId}
            onRetry={() => onRetry(item)}
            onDiscard={() => onDiscard(item)}
          />
        ))}
      </div>

      {unseen > 0 && !atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast shadow-lg"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          {tn('chat.newMessages', unseen)}
        </button>
      )}
    </div>
  );
}
