'use client';

import { isApiError } from '@nexa/api-client';
import { Hash, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea, TextField } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/states';
import { useCreateChannel, useJoinChannel } from '@/features/chat/queries';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { fold } from '@/lib/format';
import type { Channel } from '@/lib/types';
import { useChannels } from './use-channels';

/** Errors about the name itself are shown on the field, not as a toast. */
const NAME_ERRORS = new Set(['CHANNEL_EXISTS', 'INVALID_CHANNEL_NAME']);

const channelName = (channel: Channel) => channel.name ?? channel.slug ?? '';

function CreateChannelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const create = useCreateChannel();
  const descriptionId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  function close() {
    onOpenChange(false);
    setName('');
    setDescription('');
    setNameError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || null },
      {
        onSuccess: (channel) => {
          close();
          toast.success(t('channels.created'));
          router.push(`/messages/${channel.id}`);
        },
        onError: (error) => {
          if (isApiError(error) && NAME_ERRORS.has(error.code))
            setNameError(describeError(error, i18n));
          else toast.error(describeError(error, i18n));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent title={t('channels.create')} description={t('channels.createDescription')}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label={t('channels.name')}
            placeholder={t('channels.namePlaceholder')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError}
            maxLength={100}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={descriptionId} className="text-[13px] font-medium text-fg">
              {t('channels.descriptionLabel')}
            </label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('channels.descriptionPlaceholder')}
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim()} loading={create.isPending}>
              {t('channels.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChannelRow({
  channel,
  highlighted,
  joining,
  onJoin,
}: {
  channel: Channel;
  highlighted: boolean;
  joining: boolean;
  onJoin(): void;
}) {
  const { t, tn } = useI18n();
  const row = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  return (
    <li
      ref={row}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-3',
        highlighted && 'bg-accent-soft/50 ring-1 ring-accent/30',
      )}
    >
      <span
        aria-hidden
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-muted"
      >
        <Hash className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{channelName(channel)}</span>
          {channel.joined && <Badge tone="accent">{t('channels.joined')}</Badge>}
          {channel.archived && <Badge>{t('channels.archived')}</Badge>}
        </p>
        <p className="truncate text-xs text-muted">
          {[tn('people.memberCount', channel.member_count), channel.description]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {channel.joined ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/messages/${channel.id}`}>{t('channels.open')}</Link>
        </Button>
      ) : (
        !channel.archived && (
          <Button size="sm" loading={joining} onClick={onJoin}>
            {t('channels.join')}
          </Button>
        )
      )}
    </li>
  );
}

/**
 * Every channel in the organization: open the ones you're in, join the others, or create one.
 * `?create=1` opens the create dialog; `?open=<id>` points at one channel.
 */
export function ChannelBrowser() {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlight = searchParams.get('open');
  const { data: me } = useMe();
  const channels = useChannels();
  const join = useJoinChannel();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(searchParams.get('create') === '1');

  const needle = fold(query.trim());
  const sorted = [...(channels.data ?? [])].sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) ||
      channelName(a).localeCompare(channelName(b), locale),
  );
  const visible = needle
    ? sorted.filter(
        (channel) =>
          fold(channelName(channel)).includes(needle) ||
          fold(channel.description ?? '').includes(needle),
      )
    : sorted;

  function joinChannel(channel: Channel) {
    if (!me) return;
    join.mutate(
      { conversationId: channel.id, userId: me.id },
      {
        onSuccess: () => {
          toast.success(t('channels.joinedToast', { name: channelName(channel) }));
          router.push(`/messages/${channel.id}`);
        },
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title={t('channels.title')}
        description={t('channels.description')}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t('channels.create')}
          </Button>
        }
      />

      {(channels.data?.length ?? 0) > 0 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('channels.searchPlaceholder')}
            aria-label={t('channels.searchPlaceholder')}
            className="pl-9"
          />
        </div>
      )}

      {channels.isPending ? (
        <div className="flex flex-col gap-4 px-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : channels.isError ? (
        <ErrorState error={channels.error} onRetry={() => channels.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Hash}
          title={t('channels.empty')}
          description={t('channels.emptyDescription')}
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              {t('channels.create')}
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title={t('channels.noMatches', { query: query.trim() })} />
      ) : (
        <ul className="-mx-3 flex flex-col">
          {visible.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              highlighted={channel.id === highlight}
              joining={join.isPending && join.variables?.conversationId === channel.id}
              onJoin={() => joinChannel(channel)}
            />
          ))}
        </ul>
      )}

      <CreateChannelDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
