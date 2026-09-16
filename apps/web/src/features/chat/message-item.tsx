'use client';

import { AlertCircle, CheckCheck, Copy, Loader2, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/input';
import { RichText } from '@/components/ui/rich-text';
import { AttachmentList } from '@/features/feed/attachment-list';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import type { Message } from '@/lib/chat-types';
import { cn } from '@/lib/cn';
import type { UserRef } from '@/lib/types';
import { useDeleteMessage, useEditMessage } from './queries';
import type { PendingMessage } from './stores';

/** How many faces the read receipt shows before it counts the rest. */
const MAX_READERS = 4;

function Gutter({ show, children, time }: { show: boolean; children: ReactNode; time: string }) {
  return (
    <div className="w-9 shrink-0">
      {show ? (
        children
      ) : (
        <span className="invisible block pt-0.5 text-right text-[10px] leading-5 text-muted group-hover:visible">
          {time}
        </span>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  destructive,
  onClick,
}: {
  label: string;
  icon: typeof Copy;
  destructive?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-subtle',
        destructive ? 'hover:text-danger' : 'hover:text-fg',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * Who has read up to this message, on the last one you sent. In a direct conversation there is
 * only ever one reader, so a face would say nothing the words don't; in a group it is the whole
 * point, and the names are on the line itself for anyone not using a mouse.
 */
function ReadBy({ readers, faces }: { readers: UserRef[]; faces: boolean }) {
  const { t, tn } = useI18n();
  const names = readers.map((reader) => reader.display_name).join(', ');
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted" title={names}>
      <CheckCheck className="size-3.5 shrink-0 text-accent" aria-hidden />
      <span>{faces ? tn('chat.seenBy', readers.length) : t('chat.seen')}</span>
      {faces && (
        <span className="flex -space-x-1">
          {readers.slice(0, MAX_READERS).map((reader) => (
            <Avatar
              key={reader.id}
              name={reader.display_name}
              src={reader.avatar_url}
              size="xs"
              className="ring-2 ring-surface"
            />
          ))}
        </span>
      )}
      <span className="sr-only">{names}</span>
    </p>
  );
}

/**
 * One message in the log. No chat bubbles: messages read like workplace communication, with the
 * sender shown once per run of messages (spec §6).
 */
export function MessageItem({
  message,
  conversationId,
  showHeader,
  canEdit,
  canDelete,
  readers,
  readerFaces = false,
}: {
  message: Message;
  conversationId: string;
  showHeader: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** People who have read this far; only passed for the last message you sent. */
  readers?: UserRef[];
  /** Show who they are, which only tells you something outside a direct conversation. */
  readerFaces?: boolean;
}) {
  const i18n = useI18n();
  const { t, formatTime, formatDate } = i18n;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? '');
  const [confirming, setConfirming] = useState(false);
  const edit = useEditMessage(conversationId);
  const remove = useDeleteMessage(conversationId);
  const name = message.sender?.display_name ?? t('common.formerMember');
  const time = formatTime(message.created_at);

  function save() {
    const content = draft.trim();
    if (!content || content === message.content) {
      setEditing(false);
      return;
    }
    edit.mutate(
      { messageId: message.id, content },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      save();
    }
    if (event.key === 'Escape') setEditing(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(message.content ?? '');
    toast.success(t('chat.copied'));
  }

  const canCopy = Boolean(message.content);
  const showToolbar = !message.deleted && !editing && (canCopy || canEdit || canDelete);

  return (
    <div
      className={cn(
        'group relative flex gap-3 rounded-md px-2 hover:bg-surface-subtle/60',
        showHeader ? 'mt-3 pt-1' : 'mt-px',
      )}
    >
      <Gutter show={showHeader} time={time}>
        <Avatar name={name} src={message.sender?.avatar_url} size="md" />
      </Gutter>
      <div className="min-w-0 flex-1 pb-0.5">
        {showHeader && (
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-fg">{name}</span>
            <time
              dateTime={message.created_at}
              title={formatDate(message.created_at, { dateStyle: 'long', timeStyle: 'short' })}
              className="text-xs text-muted"
            >
              {time}
            </time>
          </p>
        )}
        {message.deleted ? (
          <p className="text-sm text-muted italic">{t('chat.deletedMessage')}</p>
        ) : editing ? (
          <div className="flex flex-col gap-1.5 py-1">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              maxLength={4000}
              aria-label={t('chat.composerLabel')}
              className="min-h-9 [field-sizing:content]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} loading={edit.isPending}>
                {t('chat.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {message.content && <RichText text={message.content} className="text-sm text-fg" />}
            {message.attachments.length > 0 && (
              <div className="mt-1 max-w-md">
                <AttachmentList attachments={message.attachments} />
              </div>
            )}
            {message.edited_at && (
              <span className="text-[11px] text-muted">({t('chat.edited')})</span>
            )}
          </>
        )}
        {readers && readers.length > 0 && <ReadBy readers={readers} faces={readerFaces} />}
      </div>

      {showToolbar && (
        // Hidden until the message is hovered or focused; always there on touch screens.
        <div className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-sm group-focus-within:flex group-hover:flex max-md:flex">
          {canCopy && <ToolbarButton label={t('chat.copy')} icon={Copy} onClick={copy} />}
          {canEdit && (
            <ToolbarButton
              label={t('chat.edit')}
              icon={Pencil}
              onClick={() => {
                setDraft(message.content ?? '');
                setEditing(true);
              }}
            />
          )}
          {canDelete && (
            <ToolbarButton
              label={t('chat.delete')}
              icon={Trash2}
              destructive
              onClick={() => setConfirming(true)}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('chat.deleteTitle')}
        description={t('chat.deleteDescription')}
        confirmLabel={t('chat.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(message.id, {
            onSuccess: () => setConfirming(false),
            onError: (error) => toast.error(describeError(error, i18n)),
          })
        }
      />
    </div>
  );
}

/** A message not yet confirmed by the server: pending, or failed with a retry (spec §7). */
export function PendingItem({
  pending,
  senderName,
  senderAvatar,
  showHeader,
  onRetry,
  onDiscard,
}: {
  pending: PendingMessage;
  senderName: string;
  senderAvatar?: string | null;
  showHeader: boolean;
  onRetry(): void;
  onDiscard(): void;
}) {
  const { t, formatTime } = useI18n();
  const failed = pending.status === 'failed';
  return (
    <div className={cn('flex gap-3 px-2', showHeader ? 'mt-3 pt-1' : 'mt-px')}>
      <Gutter show={showHeader} time={formatTime(pending.createdAt)}>
        <Avatar name={senderName} src={senderAvatar} size="md" />
      </Gutter>
      <div className="min-w-0 flex-1">
        {showHeader && <p className="text-[13px] font-semibold">{senderName}</p>}
        <div className={cn(!failed && 'opacity-60')}>
          {pending.content && <RichText text={pending.content} className="text-sm text-fg" />}
          {pending.attachmentNames.map((name) => (
            <p key={name} className="text-xs text-muted">
              📎 {name}
            </p>
          ))}
        </div>
        {failed ? (
          <p className="mt-0.5 flex items-center gap-2 text-xs text-danger">
            <AlertCircle className="size-3.5" aria-hidden />
            {t('chat.failed')}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCw className="size-3" aria-hidden />
              {t('chat.retry')}
            </button>
            <button type="button" onClick={onDiscard} className="text-muted hover:text-fg">
              {t('chat.discard')}
            </button>
          </p>
        ) : (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {t('chat.sending')}
          </p>
        )}
      </div>
    </div>
  );
}
