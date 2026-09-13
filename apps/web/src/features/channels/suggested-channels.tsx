'use client';

import { Hash } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { useChannels } from './use-channels';

/** Channels the person hasn't joined yet, as a quiet context-column list. */
export function SuggestedChannels({ limit = 5 }: { limit?: number }) {
  const { t, tn } = useI18n();
  const { data } = useChannels();
  const channels = (data ?? [])
    .filter((channel) => !channel.joined && !channel.archived)
    .slice(0, limit);
  if (channels.length === 0) return null;

  return (
    <section aria-labelledby="suggested-channels">
      <h2 id="suggested-channels" className="mb-2 text-[13px] font-semibold">
        {t('feed.suggestedChannels')}
      </h2>
      <ul className="flex flex-col">
        {channels.map((channel) => (
          <li key={channel.id}>
            <Link
              href={`/channels?open=${channel.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-subtle"
            >
              <Hash className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{channel.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {tn('people.memberCount', channel.member_count)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
