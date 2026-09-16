'use client';

import { FileText, Paperclip, SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/input';
import { ACCEPT_ATTRIBUTE } from '@/features/feed/upload';
import { useAttachmentUploads } from '@/features/feed/use-attachment-uploads';
import { useRealtime } from '@/features/realtime/realtime-provider';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { EmojiPicker } from './emoji-picker';
import { useSendMessage } from './queries';
import { drafts, type PendingMessage } from './stores';

/** Typing signals are refreshed at most this often, and stop after this much idle time. */
const TYPING_REFRESH_MS = 3_000;
const TYPING_IDLE_MS = 4_000;

/**
 * Message composer (spec §7): Enter sends, Shift+Enter adds a line, files upload while you write.
 * The draft survives navigating away and connection problems.
 */
export function MessageComposer({
  conversationId,
  placeholder,
}: {
  conversationId: string;
  placeholder: string;
}) {
  const { t } = useI18n();
  const { socket } = useRealtime();
  const send = useSendMessage(conversationId);
  const uploads = useAttachmentUploads();
  const [content, setContent] = useState(() => drafts.get(conversationId) ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const typing = useRef<{ sentAt: number; timer?: ReturnType<typeof setTimeout> }>({ sentAt: 0 });

  useEffect(() => {
    if (content) drafts.set(conversationId, content);
    else drafts.delete(conversationId);
  }, [conversationId, content]);

  function stopTyping() {
    clearTimeout(typing.current.timer);
    if (typing.current.sentAt) {
      socket?.emit('typing.stop', { conversation_id: conversationId });
      typing.current.sentAt = 0;
    }
  }

  function signalTyping() {
    const now = Date.now();
    if (now - typing.current.sentAt > TYPING_REFRESH_MS) {
      socket?.emit('typing.start', { conversation_id: conversationId });
      typing.current.sentAt = now;
    }
    clearTimeout(typing.current.timer);
    typing.current.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  useEffect(() => () => clearTimeout(typing.current.timer), []);

  const ready = uploads.items.filter((item) => item.uploaded);
  const canSend = (content.trim().length > 0 || ready.length > 0) && !uploads.uploading;

  function submit() {
    if (!canSend) return;
    const pending: PendingMessage = {
      clientId: crypto.randomUUID(),
      conversationId,
      content: content.trim(),
      attachmentIds: uploads.readyIds,
      attachmentNames: ready.map((item) => item.file.name),
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    setContent('');
    uploads.reset();
    stopTyping();
    // A failure keeps the message on screen with a retry, so nothing is lost.
    send(pending).catch(() => undefined);
  }

  function insertEmoji(emoji: string) {
    const field = textarea.current;
    const at = field ? field.selectionStart : content.length;
    const to = field ? field.selectionEnd : content.length;
    setContent(content.slice(0, at) + emoji + content.slice(to));
    signalTyping();
    // Put the caret after what was just inserted, once React has rendered the new value.
    requestAnimationFrame(() => {
      const caret = at + emoji.length;
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length > 0) {
      event.preventDefault();
      uploads.add(event.clipboardData.files, () => toast.error(t('upload.tooMany')));
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 md:px-6">
      {uploads.items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {uploads.items.map((item) => (
            <li
              key={item.key}
              className={cn(
                'flex max-w-56 items-center gap-2 rounded-md border bg-surface px-2 py-1 text-xs',
                item.status === 'failed' ? 'border-danger text-danger' : 'border-border',
              )}
            >
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="size-6 rounded object-cover" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">
                {item.status === 'failed'
                  ? t('upload.failed', { name: item.file.name })
                  : item.status === 'uploading'
                    ? t('upload.uploading', { percent: Math.round(item.progress * 100) })
                    : item.file.name}
              </span>
              <button
                type="button"
                onClick={() => uploads.remove(item.key)}
                aria-label={t('upload.remove', { name: item.file.name })}
                className="text-muted hover:text-fg"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-accent">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(event) => {
            if (event.target.files)
              uploads.add(event.target.files, () => toast.error(t('upload.tooMany')));
            event.target.value = '';
          }}
        />
        <IconButton
          label={t('chat.attach')}
          icon={Paperclip}
          size="icon-sm"
          onClick={() => fileInput.current?.click()}
        />
        <Textarea
          ref={textarea}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (event.target.value) signalTyping();
            else stopTyping();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={stopTyping}
          placeholder={placeholder}
          aria-label={t('chat.composerLabel')}
          maxLength={4000}
          rows={1}
          className="max-h-40 min-h-8 flex-1 resize-none border-0 bg-transparent px-1 py-1 focus-visible:ring-0 [field-sizing:content]"
        />
        <EmojiPicker onPick={insertEmoji} />
        <IconButton
          label={t('chat.send')}
          icon={SendHorizontal}
          size="icon-sm"
          onClick={submit}
          disabled={!canSend}
          className={cn(canSend && 'text-accent hover:text-accent')}
        />
      </div>
    </div>
  );
}
