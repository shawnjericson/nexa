'use client';

import { Link2, MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { RichText } from '@/components/ui/rich-text';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import type { Post } from '@/lib/types';
import { AttachmentList } from './attachment-list';
import { CommentThread } from './comment-thread';
import { useDeletePost, useUpdatePost } from './queries';
import { ReactionBar } from './reaction-bar';

/** Edits within a minute of posting don't count as edits. */
const EDIT_GRACE_MS = 60_000;

function PostEditor({ post, onDone }: { post: Post; onDone: () => void }) {
  const i18n = useI18n();
  const [content, setContent] = useState(post.content);
  const update = useUpdatePost(post.id);
  const save = () =>
    update.mutate(content.trim(), {
      onSuccess: onDone,
      onError: (error) => toast.error(describeError(error, i18n)),
    });
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={10_000}
        autoFocus
        aria-label={i18n.t('feed.composerLabel')}
        className="min-h-28 [field-sizing:content]"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone}>
          {i18n.t('common.cancel')}
        </Button>
        <Button size="sm" onClick={save} loading={update.isPending} disabled={!content.trim()}>
          {i18n.t('feed.saveEdit')}
        </Button>
      </div>
    </div>
  );
}

/**
 * A post, editorial rather than card-like (spec §6): author and department context, content,
 * attachments, reactions and comments. Announcements carry a label instead of louder styling.
 */
export function PostCard({ post, detail = false }: { post: Post; detail?: boolean }) {
  const i18n = useI18n();
  const { t, tn, formatRelative, formatDate } = i18n;
  const router = useRouter();
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(detail);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = useDeletePost(post.id);

  const author = post.author;
  const name = author?.display_name ?? t('common.formerMember');
  const edited =
    new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > EDIT_GRACE_MS;
  const permalink = `/feed/${post.id}`;

  async function copyLink() {
    await navigator.clipboard.writeText(new URL(permalink, window.location.origin).toString());
    toast.success(t('feed.linkCopied'));
  }

  function confirmDelete() {
    remove.mutate(undefined, {
      onSuccess: () => {
        setConfirmingDelete(false);
        toast.success(t('feed.deleted'));
        if (detail) router.replace('/feed');
      },
      onError: (error) => toast.error(describeError(error, i18n)),
    });
  }

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3 py-5">
      {post.type === 'ANNOUNCEMENT' && (
        <p className="text-[11px] font-semibold tracking-wider text-accent uppercase">
          {t('feed.announcement')}
        </p>
      )}

      <header className="flex items-start gap-3">
        <Avatar name={name} src={author?.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <p id={titleId} className="truncate text-sm font-semibold">
            {author ? (
              <Link href={`/people/${author.id}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              <span className="text-muted">{name}</span>
            )}
          </p>
          <p className="text-xs text-muted">
            <Link href={permalink} className="hover:underline">
              <time
                dateTime={post.created_at}
                title={formatDate(post.created_at, { dateStyle: 'long', timeStyle: 'short' })}
              >
                {formatRelative(post.created_at)}
              </time>
            </Link>
            {edited && <span> · {t('feed.edited')}</span>}
          </p>
        </div>
        <Menu>
          <MenuTrigger
            className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-fg"
            aria-label={t('feed.postActions')}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={copyLink}>
              <Link2 aria-hidden />
              {t('feed.copyLink')}
            </MenuItem>
            {post.can_edit && (
              <MenuItem onSelect={() => setEditing(true)}>
                <Pencil aria-hidden />
                {t('feed.edit')}
              </MenuItem>
            )}
            {post.can_delete && (
              <>
                <MenuSeparator />
                <MenuItem destructive onSelect={() => setConfirmingDelete(true)}>
                  <Trash2 aria-hidden />
                  {t('feed.delete')}
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </header>

      {editing ? (
        <PostEditor post={post} onDone={() => setEditing(false)} />
      ) : (
        <RichText
          text={post.content}
          className={cn('text-sm text-fg', detail && 'text-[15px] leading-relaxed')}
        />
      )}

      <AttachmentList attachments={post.attachments} imageUrl={post.image_url} />

      <footer className="-ml-2 flex flex-wrap items-center gap-1">
        <ReactionBar post={post} />
        {!detail && (
          <button
            type="button"
            onClick={() => setShowComments((current) => !current)}
            aria-expanded={showComments}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-subtle hover:text-fg"
          >
            <MessageSquare className="size-4" aria-hidden />
            {post.comment_count > 0
              ? tn('comments.count', post.comment_count)
              : t('comments.toggle')}
          </button>
        )}
      </footer>

      {showComments && <CommentThread post={post} autoFocus={!detail} />}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t('feed.deleteTitle')}
        description={t('feed.deleteDescription')}
        confirmLabel={t('feed.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </article>
  );
}
