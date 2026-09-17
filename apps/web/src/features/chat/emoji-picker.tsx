'use client';

import { Search, Smile } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { fold } from '@/lib/format';
import { ALL_EMOJI, EMOJI_GROUPS } from './emoji-data';

const RECENT_KEY = 'nexa.emoji.recent';
const MAX_RECENT = 24;

/** Recently used emoji are a convenience for this browser only, so localStorage is the right home. */
function readRecent(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rememberRecent(emoji: string): string[] {
  const next = [emoji, ...readRecent().filter((item) => item !== emoji)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets a working picker, just without recents.
  }
  return next;
}

function EmojiButton({ emoji, onPick }: { emoji: string; onPick(emoji: string): void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(emoji)}
      aria-label={emoji}
      className="inline-flex size-8 items-center justify-center rounded-md text-xl leading-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {emoji}
    </button>
  );
}

/**
 * Emoji for the composer (spec §7). A curated set rather than the whole Unicode table: it needs no
 * dependency, matches the design system, and covers what people write to each other at work.
 */
export function EmojiPicker({ onPick }: { onPick(emoji: string): void }) {
  const { t, tryT } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  const needle = fold(query.trim());
  const found = useMemo(
    () => (needle ? ALL_EMOJI.filter(([, keywords]) => fold(keywords).includes(needle)) : []),
    [needle],
  );

  function pick(emoji: string) {
    setRecent(rememberRecent(emoji));
    // The composer takes the caret back itself, synchronously; closing only tidies the panel away.
    onPick(emoji);
    setOpen(false);
  }

  function groupLabel(id: string) {
    return tryT(`chat.emoji.groups.${id}`) ?? id;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setRecent(readRecent());
          setQuery('');
        }
      }}
    >
      <PopoverTrigger
        aria-label={t('chat.emoji.label')}
        title={t('chat.emoji.label')}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-subtle hover:text-fg data-[state=open]:bg-surface-subtle data-[state=open]:text-fg"
      >
        <Smile className="size-4" aria-hidden />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        // The composer puts the caret back itself; without this the trigger would grab focus first.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="relative border-b border-border p-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chat.emoji.searchPlaceholder')}
            aria-label={t('chat.emoji.searchPlaceholder')}
            autoFocus
            className="h-8 pl-8 text-[13px]"
          />
        </div>

        {/* Jumping to a group beats scrolling a long list on a phone. */}
        {!needle && (
          <div className="flex gap-0.5 overflow-x-auto border-b border-border px-2 py-1">
            {EMOJI_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() =>
                  scroller.current
                    ?.querySelector(`[data-group="${group.id}"]`)
                    ?.scrollIntoView({ block: 'start' })
                }
                className="shrink-0 rounded-md px-2 py-1 text-lg leading-none hover:bg-surface-subtle"
                title={groupLabel(group.id)}
                aria-label={groupLabel(group.id)}
              >
                {group.items[0]?.[0]}
              </button>
            ))}
          </div>
        )}

        <div ref={scroller} className="max-h-72 overflow-y-auto overscroll-contain p-2">
          {needle ? (
            found.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted">
                {t('chat.emoji.noResults')}
              </p>
            ) : (
              <div className="grid grid-cols-8 gap-0.5">
                {found.map(([emoji]) => (
                  <EmojiButton key={emoji} emoji={emoji} onPick={pick} />
                ))}
              </div>
            )
          ) : (
            <>
              {recent.length > 0 && (
                <section aria-label={t('chat.emoji.groups.recent')}>
                  <h3 className="px-1 pb-1 text-[11px] font-medium tracking-wider text-muted uppercase">
                    {t('chat.emoji.groups.recent')}
                  </h3>
                  <div className="grid grid-cols-8 gap-0.5">
                    {recent.map((emoji) => (
                      <EmojiButton key={emoji} emoji={emoji} onPick={pick} />
                    ))}
                  </div>
                </section>
              )}
              {EMOJI_GROUPS.map((group, index) => (
                <section
                  key={group.id}
                  data-group={group.id}
                  aria-label={groupLabel(group.id)}
                  className={cn((index > 0 || recent.length > 0) && 'pt-2')}
                >
                  <h3 className="px-1 pb-1 text-[11px] font-medium tracking-wider text-muted uppercase">
                    {groupLabel(group.id)}
                  </h3>
                  <div className="grid grid-cols-8 gap-0.5">
                    {group.items.map(([emoji]) => (
                      <EmojiButton key={emoji} emoji={emoji} onPick={pick} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
