'use client';

import { AlertCircle, FileText, Loader2, Megaphone, Paperclip, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Kbd } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/input';
import { useOrganization } from '@/features/organization/organization-provider';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useCreatePost } from './queries';
import { ACCEPT_ATTRIBUTE } from './upload';
import { useAttachmentUploads, type PendingAttachment } from './use-attachment-uploads';

/** Roles that hold announcement.publish by default (a UI hint; the API decides). */
const ANNOUNCERS = new Set(['OWNER', 'ADMIN', 'MANAGER']);

function PendingItem({ item, onRemove }: { item: PendingAttachment; onRemove: () => void }) {
  const { t, locale } = useI18n();
  const name = item.file.name;
  const failure =
    item.failure === 'too-large'
      ? t('upload.tooLarge', { name })
      : item.failure === 'unsupported'
        ? t('upload.unsupported', { name })
        : item.failure
          ? t('upload.failed', { name })
          : null;

  return (
    <li
      className={cn(
        'relative flex w-40 flex-col overflow-hidden rounded-lg border bg-surface',
        failure ? 'border-danger' : 'border-border',
      )}
    >
      {item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="h-24 w-full object-cover" />
      ) : (
        <span className="flex h-24 items-center justify-center bg-surface-subtle">
          <FileText className="size-6 text-muted" aria-hidden />
        </span>
      )}
      <span className="flex items-center gap-1 px-2 py-1.5 text-xs">
        {item.status === 'uploading' && (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted" aria-hidden />
        )}
        {failure && <AlertCircle className="size-3 shrink-0 text-danger" aria-hidden />}
        <span className="min-w-0 flex-1 truncate" title={name}>
          {failure ?? name}
        </span>
      </span>
      {item.status === 'uploading' && (
        <span
          role="progressbar"
          aria-label={t('upload.uploading', { percent: Math.round(item.progress * 100) })}
          aria-valuenow={Math.round(item.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-accent transition-[width]"
          style={{ width: `${Math.max(4, item.progress * 100)}%` }}
        />
      )}
      {!failure && item.status !== 'uploading' && (
        <span className="sr-only">{formatBytes(item.file.size, locale)}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('upload.remove', { name })}
        className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full bg-fg/70 text-background hover:bg-fg"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

/**
 * New post: text, up to 10 files (uploaded straight to storage while the person keeps writing),
 * and - for people who may publish them - announcements. The draft survives failures (§15).
 */
export function PostComposer({ autoFocus = false }: { autoFocus?: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { data: me } = useMe();
  const { organization } = useOrganization();
  const canAnnounce = ANNOUNCERS.has(organization.role);
  const [content, setContent] = useState('');
  const [announcement, setAnnouncement] = useState(false);
  const [expanded, setExpanded] = useState(autoFocus);
  const [dragging, setDragging] = useState(false);
  const uploads = useAttachmentUploads();
  const create = useCreatePost();
  const fileInput = useRef<HTMLInputElement>(null);

  const canSubmit = content.trim().length > 0 && !uploads.uploading && !create.isPending;

  const addFiles = (files: Iterable<File>) => {
    setExpanded(true);
    uploads.add(files, () => toast.error(t('upload.tooMany')));
  };

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        content: content.trim(),
        type: announcement ? 'ANNOUNCEMENT' : 'GENERAL',
        attachment_ids: uploads.readyIds,
      },
      {
        onSuccess: () => {
          setContent('');
          setAnnouncement(false);
          uploads.reset();
          setExpanded(false);
          toast.success(t('feed.created'));
        },
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length > 0) {
      event.preventDefault();
      addFiles(event.clipboardData.files);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'rounded-xl border bg-surface p-3 transition-colors',
        dragging ? 'border-accent bg-accent-soft/40' : 'border-border',
      )}
    >
      <div className="flex gap-3">
        <Avatar name={me?.display_name ?? '?'} src={me?.avatar_url} size="md" />
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={t('feed.composerPlaceholder')}
          aria-label={t('feed.composerLabel')}
          autoFocus={autoFocus}
          maxLength={10_000}
          rows={expanded ? 3 : 1}
          className={cn(
            'flex-1 resize-none border-transparent bg-transparent px-1 focus-visible:border-transparent focus-visible:ring-0',
            expanded ? 'min-h-20 [field-sizing:content]' : 'min-h-9',
          )}
        />
      </div>

      {uploads.items.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 pl-12">
          {uploads.items.map((item) => (
            <PendingItem key={item.key} item={item} onRemove={() => uploads.remove(item.key)} />
          ))}
        </ul>
      )}

      {expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <IconButton
            label={t('feed.attach')}
            icon={Paperclip}
            size="icon-sm"
            onClick={() => fileInput.current?.click()}
          />
          {canAnnounce && (
            <Button
              variant={announcement ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={announcement}
              onClick={() => setAnnouncement((current) => !current)}
              className={cn(announcement && 'border-accent text-accent')}
            >
              <Megaphone aria-hidden />
              {t('feed.postAsAnnouncement')}
            </Button>
          )}
          <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:inline-flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
          </span>
          <Button size="sm" onClick={submit} disabled={!canSubmit} loading={create.isPending}>
            {t('feed.post')}
          </Button>
        </div>
      )}
    </div>
  );
}
