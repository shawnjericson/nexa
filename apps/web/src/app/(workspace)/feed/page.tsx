'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/states';
import { SuggestedChannels } from '@/features/channels/suggested-channels';
import { PostComposer } from '@/features/feed/composer';
import { FeedList } from '@/features/feed/feed-list';
import { useI18n } from '@/i18n/provider';

/** Feed: one reading column, with a quiet context column on wide screens (spec §3.1). */
export default function FeedPage() {
  const { t } = useI18n();
  const compose = useSearchParams().get('compose') === '1';
  return (
    <div className="mx-auto flex w-full max-w-5xl gap-10 px-4 py-6 md:px-8">
      <div className="min-w-0 max-w-2xl flex-1">
        <PageHeader title={t('feed.title')} className="mb-5" />
        <PostComposer autoFocus={compose} />
        <FeedList />
      </div>
      <aside className="hidden w-64 shrink-0 pt-14 xl:block">
        <SuggestedChannels />
      </aside>
    </div>
  );
}
