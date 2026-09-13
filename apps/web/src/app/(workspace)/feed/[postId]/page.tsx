'use client';

import { isApiError } from '@nexa/api-client';
import { ArrowLeft, FileX2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PostSkeleton } from '@/features/feed/feed-list';
import { PostCard } from '@/features/feed/post-card';
import { usePost } from '@/features/feed/queries';
import { useI18n } from '@/i18n/provider';

/** A post's own page (deep links, notifications). Gone or forbidden posts reveal nothing (§15). */
export default function PostPage() {
  const { t } = useI18n();
  const { postId } = useParams<{ postId: string }>();
  const query = usePost(postId);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link href="/feed">
          <ArrowLeft aria-hidden />
          {t('feed.backToFeed')}
        </Link>
      </Button>
      {query.isPending ? (
        <PostSkeleton />
      ) : query.isError ? (
        isApiError(query.error) && (query.error.status === 404 || query.error.status === 400) ? (
          <EmptyState
            icon={FileX2}
            title={t('feed.unavailableTitle')}
            description={t('feed.unavailableDescription')}
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        )
      ) : (
        <PostCard post={query.data} detail />
      )}
    </div>
  );
}
