'use client';

import { isApiError } from '@nexa/api-client';
import { ArrowLeft, Archive, Hash, Info, LogOut, MessageSquareOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { usePresence } from '@/features/people/queries';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import type { ConversationDetails } from '@/lib/chat-types';
import { useStore } from '@/lib/external-store';
import { ConversationIcon, conversationTitle } from './conversation-display';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import {
  useConversation,
  useJoinChannel,
  useLeaveConversation,
  useLoadOlder,
  useMarkRead,
  useMessages,
  useSendMessage,
} from './queries';
import {
  activeConversationStore,
  EMPTY_PENDING,
  EMPTY_TYPING,
  pendingStore,
  removePending,
  typingStore,
} from './stores';

function TypingIndicator({
  conversation,
  meId,
}: {
  conversation: ConversationDetails;
  meId?: string;
}) {
  const { t } = useI18n();
  const typing = useStore(typingStore, (state) => state[conversation.id] ?? EMPTY_TYPING);
  const names = Object.keys(typing)
    .filter((userId) => userId !== meId)
    .map(
      (userId) =>
        conversation.members.find((member) => member.user?.id === userId)?.user?.display_name,
    )
    .filter((name): name is string => Boolean(name));
  return (
    <p aria-live="polite" className="h-5 px-6 text-[11px] text-muted">
      {names.length === 1
        ? t('chat.typingOne', { name: names[0] ?? '' })
        : names.length > 1
          ? t('chat.typingMany')
          : ''}
    </p>
  );
}

function DetailsPanel({
  conversation,
  onLeft,
}: {
  conversation: ConversationDetails;
  onLeft(): void;
}) {
  const i18n = useI18n();
  const { t, tn } = i18n;
  const { data: me } = useMe();
  const leave = useLeaveConversation();
  const [confirming, setConfirming] = useState(false);
  const title = conversationTitle(conversation, t('common.formerMember'));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <ConversationIcon conversation={conversation} title={title} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted">{tn('chat.members', conversation.member_count)}</p>
        </div>
      </div>
      {conversation.description && <p className="text-sm text-fg">{conversation.description}</p>}
      <section aria-labelledby="conversation-members">
        <h3
          id="conversation-members"
          className="mb-1 text-[11px] font-medium tracking-wider text-muted uppercase"
        >
          {t('chat.membersTitle')}
        </h3>
        <ul>
          {conversation.members.map((member) => (
            <li
              key={member.user?.id ?? member.joined_at}
              className="flex items-center gap-2.5 py-1.5"
            >
              <Avatar
                name={member.user?.display_name ?? '?'}
                src={member.user?.avatar_url}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {member.user ? (
                  <Link href={`/people/${member.user.id}`} className="hover:underline">
                    {member.user.display_name}
                  </Link>
                ) : (
                  t('common.formerMember')
                )}
              </span>
              {member.role === 'OWNER' && <Badge>{t('chat.roleOwner')}</Badge>}
              {member.role === 'ADMIN' && <Badge>{t('chat.roleAdmin')}</Badge>}
            </li>
          ))}
        </ul>
      </section>
      {conversation.type !== 'DIRECT' && conversation.my_role && me && (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setConfirming(true)}
          >
            <LogOut aria-hidden />
            {t('chat.leave')}
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t('chat.leaveTitle')}
            description={t('chat.leaveDescription')}
            confirmLabel={t('chat.leave')}
            destructive
            loading={leave.isPending}
            onConfirm={() =>
              leave.mutate(
                { conversationId: conversation.id, userId: me.id },
                {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success(t('chat.left'));
                    onLeft();
                  },
                  onError: (error) => toast.error(describeError(error, i18n)),
                },
              )
            }
          />
        </>
      )}
    </div>
  );
}

/** One conversation: header, log, typing indicator and composer; details beside it (spec §6). */
export function ConversationView({ conversationId }: { conversationId: string }) {
  const i18n = useI18n();
  const { t, tn } = i18n;
  const router = useRouter();
  const { data: me } = useMe();
  const { isManager } = useOrganization();
  const details = useConversation(conversationId);
  const conversation = details.data;
  const isMember = Boolean(conversation?.my_role);
  const messages = useMessages(conversationId, isMember);
  const pending = useStore(pendingStore, (state) => state[conversationId] ?? EMPTY_PENDING);
  const loadOlder = useLoadOlder(conversationId);
  const markRead = useMarkRead(conversationId);
  const send = useSendMessage(conversationId);
  const join = useJoinChannel();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [readAtOpen, setReadAtOpen] = useState<number | null>(null);
  const reported = useRef(0);

  const peerId = conversation?.type === 'DIRECT' ? conversation.direct_peer?.id : undefined;
  const presence = usePresence(peerId ? [peerId] : []);
  const online = peerId ? presence.data?.[peerId] === 'online' : undefined;

  useEffect(() => {
    activeConversationStore.set(() => conversationId);
    return () =>
      activeConversationStore.set((current) => (current === conversationId ? null : current));
  }, [conversationId]);

  // Freeze where the person left off, for the unread divider.
  useEffect(() => {
    if (readAtOpen === null && conversation?.last_read_seq != null)
      setReadAtOpen(conversation.last_read_seq);
  }, [conversation?.last_read_seq, readAtOpen]);

  const onReadUpTo = useCallback(
    (seq: number) => {
      if (seq <= reported.current || seq <= (conversation?.last_read_seq ?? 0)) return;
      reported.current = seq;
      markRead(seq).catch(() => {
        reported.current = 0;
      });
    },
    [markRead, conversation?.last_read_seq],
  );

  const seenSeq = useMemo(() => {
    if (conversation?.type !== 'DIRECT') return null;
    const peer = conversation.members.find((member) => member.user?.id !== me?.id);
    return peer?.last_read_seq ?? null;
  }, [conversation, me?.id]);

  if (details.isPending) {
    return (
      <div className="flex h-full flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    );
  }
  if (details.isError || !conversation) {
    const gone = isApiError(details.error) && [400, 403, 404].includes(details.error.status);
    return gone ? (
      <EmptyState
        className="h-full justify-center"
        icon={MessageSquareOff}
        title={t('chat.unavailableTitle')}
        description={t('chat.unavailableDescription')}
      />
    ) : (
      <ErrorState
        className="h-full justify-center"
        error={details.error}
        onRetry={() => details.refetch()}
      />
    );
  }

  const title = conversationTitle(conversation, t('common.formerMember'));
  const subtitle =
    conversation.type === 'DIRECT'
      ? online
        ? t('people.online')
        : t('people.offline')
      : (conversation.description ?? tn('chat.members', conversation.member_count));
  const leaveTo = () => router.replace('/messages');

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 md:px-5">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={t('chat.back')}
          >
            <Link href="/messages">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <ConversationIcon conversation={conversation} title={title} online={online} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">
              {conversation.type === 'CHANNEL' ? `# ${title}` : title}
            </h1>
            <p className="truncate text-xs text-muted">{subtitle}</p>
          </div>
          <IconButton
            label={t('chat.details')}
            icon={Info}
            size="icon-sm"
            onClick={() => setDetailsOpen(true)}
          />
        </header>

        {conversation.archived && (
          <p className="flex items-center gap-2 border-b border-border bg-surface-subtle px-5 py-2 text-xs text-muted">
            <Archive className="size-3.5" aria-hidden />
            {t('chat.archived')}
          </p>
        )}

        {!isMember ? (
          <EmptyState
            className="flex-1 justify-center"
            icon={Hash}
            title={t('chat.joinPrompt')}
            action={
              me && (
                <Button
                  loading={join.isPending}
                  onClick={() =>
                    join.mutate(
                      { conversationId, userId: me.id },
                      { onError: (error) => toast.error(describeError(error, i18n)) },
                    )
                  }
                >
                  {t('chat.join')}
                </Button>
              )
            }
          />
        ) : messages.isPending ? (
          <div className="flex flex-1 flex-col gap-4 p-6">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        ) : messages.isError ? (
          <ErrorState
            className="flex-1 justify-center"
            error={messages.error}
            onRetry={() => messages.refetch()}
          />
        ) : (
          <>
            <MessageList
              conversation={conversation}
              messages={messages.data.messages}
              hasOlder={messages.data.hasOlder}
              loadOlder={loadOlder}
              pending={pending}
              meId={me?.id}
              meName={me?.display_name ?? t('common.you')}
              meAvatar={me?.avatar_url}
              readAtOpen={readAtOpen}
              seenSeq={seenSeq}
              isOrganizationManager={isManager}
              onReadUpTo={onReadUpTo}
              onRetry={(item) => send(item).catch(() => undefined)}
              onDiscard={(item) => removePending(conversationId, item.clientId)}
            />
            <TypingIndicator conversation={conversation} meId={me?.id} />
            {!conversation.archived && (
              <MessageComposer
                key={conversationId}
                conversationId={conversationId}
                placeholder={t('chat.composerPlaceholder', {
                  name: conversation.type === 'CHANNEL' ? `#${title}` : title,
                })}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent title={t('chat.details')}>
          <DetailsPanel
            conversation={conversation}
            onLeft={() => {
              setDetailsOpen(false);
              leaveTo();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
