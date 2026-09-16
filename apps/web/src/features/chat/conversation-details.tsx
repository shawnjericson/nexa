'use client';

import { FileText, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import type { ConversationDetails as Conversation, Message } from '@/lib/chat-types';
import { formatBytes } from '@/lib/format';
import { ConversationIcon, conversationTitle } from './conversation-display';
import { useLeaveConversation } from './queries';

/** Files from the part of the history that is loaded, newest first. */
const MAX_FILES = 12;

function SharedFiles({ messages }: { messages: Message[] }) {
  const { t, locale } = useI18n();
  const files = [...messages]
    .reverse()
    .flatMap((message) => (message.deleted ? [] : message.attachments))
    .slice(0, MAX_FILES);

  return (
    <section aria-labelledby="conversation-files">
      <h3
        id="conversation-files"
        className="mb-1 text-[11px] font-medium tracking-wider text-muted uppercase"
      >
        {t('chat.sharedFiles')}
      </h3>
      {files.length === 0 ? (
        <p className="text-xs text-muted">{t('chat.noSharedFiles')}</p>
      ) : (
        <ul className="flex flex-col">
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-md py-1.5 hover:bg-surface-subtle"
              >
                {file.kind === 'image' ? (
                  <img
                    src={file.url}
                    alt=""
                    loading="lazy"
                    className="size-8 rounded object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded bg-surface-subtle text-muted"
                  >
                    <FileText className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{file.filename}</span>
                  <span className="block text-xs text-muted">{formatBytes(file.size, locale)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Who is in the conversation and what has been shared in it (spec §6). */
export function ConversationDetails({
  conversation,
  messages,
  onLeft,
}: {
  conversation: Conversation;
  messages: Message[];
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

      <SharedFiles messages={messages} />

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
