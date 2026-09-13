'use client';

import { Newspaper } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useI18n } from '@/i18n/provider';
import { PostCard } from './post-card';
import { useFeed } from './queries';

export function PostSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-5" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

/** The feed with infinite scrolling, plus a button for keyboard and screen-reader users. */
export function FeedList() {
  const { t } = useI18n();
  const feed = useFeed();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage)
          void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isPending) {
    return (
      <div className="divide-y divide-border">
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }
  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => feed.refetch()} />;

  const posts = feed.data.pages.flatMap((page) => page.data);
  if (posts.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        title={t('feed.emptyTitle')}
        description={t('feed.emptyDescription')}
      />
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <div ref={sentinel} className="flex justify-center py-6">
        {hasNextPage ? (
          <Button
            variant="secondary"
            size="sm"
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {t('feed.loadMore')}
          </Button>
        ) : (
          <p className="text-xs text-muted">{t('feed.end')}</p>
        )}
      </div>
    </div>
  );
}
