'use client';

import { SmilePlus } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import type { Post, ReactionType } from '@/lib/types';
import { useReaction } from './queries';

export const REACTIONS: Array<{ type: ReactionType; emoji: string }> = [
  { type: 'LIKE', emoji: '👍' },
  { type: 'LOVE', emoji: '❤️' },
  { type: 'HAHA', emoji: '😄' },
  { type: 'CELEBRATE', emoji: '🎉' },
  { type: 'SAD', emoji: '😢' },
];

const emojiOf = (type: ReactionType) => REACTIONS.find((item) => item.type === type)?.emoji ?? '👍';

/** One reaction per person (the API replaces it). Updates at once and rolls back on failure. */
export function ReactionBar({ post }: { post: Post }) {
  const i18n = useI18n();
  const { t, tn } = i18n;
  const [open, setOpen] = useState(false);
  const mutation = useReaction(post.id);
  const { reactions } = post;
  const mine = reactions.viewer_reaction;

  const react = (type: ReactionType | null) => {
    setOpen(false);
    mutation.mutate(type, { onError: (error) => toast.error(describeError(error, i18n)) });
  };

  const top = REACTIONS.filter((item) => reactions.counts[item.type] > 0)
    .sort((a, b) => reactions.counts[b.type] - reactions.counts[a.type])
    .slice(0, 3);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => react(mine ? null : 'LIKE')}
        aria-pressed={mine !== null}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-surface-subtle',
          mine ? 'text-accent' : 'text-muted hover:text-fg',
        )}
      >
        <span aria-hidden className="text-base leading-none">
          {mine ? emojiOf(mine) : '👍'}
        </span>
        {t(`reactions.${mine ?? 'LIKE'}`)}
      </button>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-subtle hover:text-fg"
          aria-label={t('reactions.choose')}
        >
          <SmilePlus className="size-4" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={4}
            className="z-50 flex gap-0.5 rounded-full border border-border bg-surface p-1 shadow-lg"
          >
            {REACTIONS.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => react(item.type === mine ? null : item.type)}
                aria-label={t(`reactions.${item.type}`)}
                aria-pressed={item.type === mine}
                title={t(`reactions.${item.type}`)}
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-surface-subtle motion-reduce:transform-none',
                  item.type === mine && 'bg-accent-soft',
                )}
              >
                <span aria-hidden>{item.emoji}</span>
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {reactions.total > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted">
          <span aria-hidden className="tracking-tighter">
            {top.map((item) => item.emoji).join('')}
          </span>
          <span className="sr-only">{tn('reactions.total', reactions.total)}</span>
          <span aria-hidden>{i18n.formatNumber(reactions.total)}</span>
        </span>
      )}
    </div>
  );
}
