'use client';

import Link from 'next/link';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/input';
import { RichText } from '@/components/ui/rich-text';
import { Skeleton } from '@/components/ui/states';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import type { Post, PostComment } from '@/lib/types';
import { useComments, useCreateComment, useDeleteComment } from './queries';

function CommentComposer({
  postId,
  parentId,
  placeholder,
  autoFocus,
  onDone,
}: {
  postId: string;
  parentId?: string;
  placeholder: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const i18n = useI18n();
  const { data: me } = useMe();
  const [content, setContent] = useState('');
  const create = useCreateComment(postId);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = content.trim();
    if (!text || create.isPending) return;
    create.mutate(
      { content: text, ...(parentId && { parent_id: parentId }) },
      {
        onSuccess: () => {
          setContent('');
          onDone?.();
        },
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  // Enter sends, Shift+Enter starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <Avatar name={me?.display_name ?? '?'} src={me?.avatar_url} size="sm" className="mt-0.5" />
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        maxLength={2000}
        rows={1}
        className="min-h-9 flex-1 py-1.5 [field-sizing:content]"
      />
      <Button
        type="submit"
        size="sm"
        className="mt-0.5"
        disabled={!content.trim()}
        loading={create.isPending}
      >
        {i18n.t('comments.send')}
      </Button>
    </form>
  );
}

function CommentItem({
  comment,
  onReply,
  onDelete,
}: {
  comment: PostComment;
  onReply?: () => void;
  onDelete: () => void;
}) {
  const { t, formatRelative, formatDate } = useI18n();
  const author = comment.author;
  const name = author?.display_name ?? t('common.formerMember');
  return (
    <div className="flex gap-2.5">
      <Avatar name={name} src={author?.avatar_url} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {author ? (
            <Link
              href={`/people/${author.id}`}
              className="text-[13px] font-semibold hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="text-[13px] font-semibold text-muted">{name}</span>
          )}
          <time
            dateTime={comment.created_at}
            title={formatDate(comment.created_at, { dateStyle: 'long', timeStyle: 'short' })}
            className="text-xs text-muted"
          >
            {formatRelative(comment.created_at)}
          </time>
        </div>
        <RichText text={comment.content} className="text-sm text-fg" />
        <div className="mt-0.5 flex gap-3 text-xs font-medium text-muted">
          {onReply && (
            <button type="button" onClick={onReply} className="hover:text-fg">
              {t('comments.reply')}
            </button>
          )}
          {comment.can_delete && (
            <button type="button" onClick={onDelete} className="hover:text-danger">
              {t('comments.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Comments, oldest first; replies are one level deep under their thread root. */
export function CommentThread({ post, autoFocus }: { post: Post; autoFocus?: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const query = useComments(post.id);
  const remove = useDeleteComment(post.id);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PostComment | null>(null);

  const comments = query.data?.pages.flatMap((page) => page.data) ?? [];
  const roots = comments.filter((comment) => comment.parent_id === null);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parent_id === id);

  function confirmDelete() {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onSuccess: () => setPendingDelete(null),
      onError: (error) => toast.error(describeError(error, i18n)),
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      {query.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : roots.length === 0 ? (
        <p className="text-sm text-muted">{t('comments.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {roots.map((root) => (
            <li key={root.id} className="flex flex-col gap-3">
              <CommentItem
                comment={root}
                onReply={() => setReplyTo(root)}
                onDelete={() => setPendingDelete(root)}
              />
              {(repliesOf(root.id).length > 0 || replyTo?.id === root.id) && (
                <ul className="ml-9 flex flex-col gap-3 border-l border-border pl-3">
                  {repliesOf(root.id).map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        comment={reply}
                        onReply={() => setReplyTo(root)}
                        onDelete={() => setPendingDelete(reply)}
                      />
                    </li>
                  ))}
                  {replyTo?.id === root.id && (
                    <li>
                      <CommentComposer
                        postId={post.id}
                        parentId={root.id}
                        autoFocus
                        placeholder={t('comments.replyPlaceholder', {
                          name: root.author?.display_name ?? t('common.formerMember'),
                        })}
                        onDone={() => setReplyTo(null)}
                      />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t('comments.loadMore')}
        </Button>
      )}

      <CommentComposer
        postId={post.id}
        placeholder={t('comments.placeholder')}
        autoFocus={autoFocus}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('comments.deleteTitle')}
        description={
          pendingDelete?.parent_id === null ? t('comments.deleteDescription') : undefined
        }
        confirmLabel={t('comments.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
