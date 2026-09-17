'use client';

import { Check, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, TextField } from '@/components/ui/input';
import { useMemberPage } from '@/features/people/queries';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { useDebounced } from '@/lib/use-debounced';
import { useCreateGroup, useOpenDirect } from './queries';

type Mode = 'direct' | 'group';

const PICKER_SIZE = 30;

/** Start a direct conversation with someone, or a group with several people. */
export function NewConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const i18n = useI18n();
  const { t, tn } = i18n;
  const router = useRouter();
  const { data: me } = useMe();
  const openDirect = useOpenDirect();
  const createGroup = useCreateGroup();
  const [mode, setMode] = useState<Mode>('direct');
  const [query, setQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const search = useDebounced(query.trim(), 250);
  // The first matches by name; typing narrows them down on the server.
  const members = useMemberPage({ q: search, sort: 'name', limit: PICKER_SIZE }, { enabled: open });

  const people = (members.data?.data ?? []).flatMap((member) =>
    member.user &&
    member.user.id !== me?.id &&
    !member.user.deactivated &&
    member.status === 'ACTIVE'
      ? [member.user]
      : [],
  );

  function close() {
    onOpenChange(false);
    setQuery('');
    setGroupName('');
    setSelected([]);
  }

  function startDirect(userId: string) {
    openDirect.mutate(userId, {
      onSuccess: (conversation) => {
        close();
        router.push(`/messages/${conversation.id}`);
      },
      onError: (error) => toast.error(describeError(error, i18n)),
    });
  }

  function submitGroup() {
    createGroup.mutate(
      { name: groupName.trim(), memberIds: selected },
      {
        onSuccess: (conversation) => {
          close();
          router.push(`/messages/${conversation.id}`);
        },
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent title={t('chat.newConversation')}>
        <div role="tablist" className="mb-4 inline-flex rounded-lg bg-surface-subtle p-0.5">
          {(['direct', 'group'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
                mode === item ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {item === 'direct' ? t('chat.directTab') : t('chat.groupTab')}
            </button>
          ))}
        </div>

        {mode === 'group' && (
          <TextField
            label={t('chat.groupName')}
            placeholder={t('chat.groupNamePlaceholder')}
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            maxLength={100}
            className="mb-3"
          />
        )}

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chat.searchPeople')}
            aria-label={t('chat.searchPeople')}
            className="pl-9"
            autoFocus
          />
        </div>

        <ul className="mt-2 max-h-72 overflow-y-auto" aria-label={t('chat.pickPeople')}>
          {people.map((user) => {
            const checked = selected.includes(user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => (mode === 'direct' ? startDirect(user.id) : toggle(user.id))}
                  disabled={openDirect.isPending}
                  aria-pressed={mode === 'group' ? checked : undefined}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-subtle"
                >
                  <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user.display_name}</span>
                    <span className="block truncate text-xs text-muted">@{user.username}</span>
                  </span>
                  {mode === 'group' && (
                    <span
                      className={cn(
                        'inline-flex size-5 items-center justify-center rounded border',
                        checked ? 'border-accent bg-accent text-accent-contrast' : 'border-border',
                      )}
                    >
                      {checked && <Check className="size-3.5" aria-hidden />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {mode === 'group' && (
          <DialogFooter className="items-center justify-between">
            <span className="text-xs text-muted">{tn('chat.selected', selected.length)}</span>
            <Button
              onClick={submitGroup}
              disabled={!groupName.trim() || selected.length === 0}
              loading={createGroup.isPending}
            >
              {t('chat.createGroup')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
