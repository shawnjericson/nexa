'use client';

import { Search, SearchX } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/translate';
import { cn } from '@/lib/cn';
import type { UserRef } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import {
  searchable,
  useSearchConversations,
  useSearchMessages,
  useSearchOverview,
  useSearchPeople,
  useSearchPosts,
  type SearchKind,
} from './queries';
import { ConversationHitRow, MessageHitRow, PersonHit, PostHitRow } from './search-results';

type Tab = 'all' | SearchKind;

const TABS: Array<{ id: Tab; label: MessageKey }> = [
  { id: 'all', label: 'search.everything' },
  { id: 'people', label: 'search.people' },
  { id: 'posts', label: 'search.posts' },
  { id: 'conversations', label: 'search.conversations' },
  { id: 'messages', label: 'search.messages' },
];

const OVERVIEW_LIMIT = 5;

const isUser = (user: UserRef | null): user is UserRef => Boolean(user);

function hrefFor(query: string, tab: Tab): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (tab !== 'all') params.set('type', tab);
  const search = params.toString();
  return search ? `/search?${search}` : '/search';
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-3" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={SearchX}
      title={t('search.noResults', { query })}
      description={t('search.noResultsDescription')}
    />
  );
}

function Section({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section aria-label={title}>
      <div className="mb-1 flex h-8 items-center justify-between px-3">
        <h2 className="text-[11px] font-medium tracking-wider text-muted uppercase">{title}</h2>
        {onSeeAll && (
          <Button variant="ghost" size="sm" onClick={onSeeAll}>
            {t('search.seeAll')}
          </Button>
        )}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** A few results of every kind; "See all" opens that kind's tab. */
function Overview({ query, onTab }: { query: string; onTab(tab: Tab): void }) {
  const { t } = useI18n();
  const overview = useSearchOverview(query, OVERVIEW_LIMIT);
  if (overview.isPending) return <ResultsSkeleton />;
  if (overview.isError) {
    return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  }

  const { posts, conversations, messages } = overview.data;
  const people = overview.data.people.items.filter(isUser);
  if (
    people.length + posts.items.length + conversations.items.length + messages.items.length ===
    0
  ) {
    return <NoResults query={query} />;
  }

  return (
    <div className={cn('flex flex-col gap-6', overview.isPlaceholderData && 'opacity-60')}>
      {people.length > 0 && (
        <Section
          title={t('search.people')}
          onSeeAll={overview.data.people.has_more ? () => onTab('people') : undefined}
        >
          {people.map((user) => (
            <PersonHit key={user.id} user={user} />
          ))}
        </Section>
      )}
      {conversations.items.length > 0 && (
        <Section
          title={t('search.conversations')}
          onSeeAll={conversations.has_more ? () => onTab('conversations') : undefined}
        >
          {conversations.items.map((hit) => (
            <ConversationHitRow key={hit.id} hit={hit} />
          ))}
        </Section>
      )}
      {posts.items.length > 0 && (
        <Section
          title={t('search.posts')}
          onSeeAll={posts.has_more ? () => onTab('posts') : undefined}
        >
          {posts.items.map((hit) => (
            <PostHitRow key={hit.id} hit={hit} />
          ))}
        </Section>
      )}
      {messages.items.length > 0 && (
        <Section
          title={t('search.messages')}
          onSeeAll={messages.has_more ? () => onTab('messages') : undefined}
        >
          {messages.items.map((hit) => (
            <MessageHitRow key={hit.id} hit={hit} />
          ))}
        </Section>
      )}
    </div>
  );
}

interface PagedResult<T> {
  data?: { pages: Array<{ data: T[] }> };
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  refetch(): unknown;
  fetchNextPage(): unknown;
}

function Paged<T>({
  result,
  query,
  render,
}: {
  result: PagedResult<T>;
  query: string;
  render(item: T): ReactNode;
}) {
  const { t } = useI18n();
  if (result.isPending) return <ResultsSkeleton />;
  if (result.isError) return <ErrorState error={result.error} onRetry={() => result.refetch()} />;
  const items = result.data?.pages.flatMap((page) => page.data) ?? [];
  if (items.length === 0) return <NoResults query={query} />;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">{items.map(render)}</ul>
      {result.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            loading={result.isFetchingNextPage}
            onClick={() => result.fetchNextPage()}
          >
            {t('search.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** One kind of result, best match first, loaded a page at a time. */
function KindResults({ kind, query }: { kind: SearchKind; query: string }) {
  const people = useSearchPeople(query, kind === 'people');
  const posts = useSearchPosts(query, kind === 'posts');
  const conversations = useSearchConversations(query, kind === 'conversations');
  const messages = useSearchMessages(query, kind === 'messages');

  switch (kind) {
    case 'people':
      return (
        <Paged
          result={people}
          query={query}
          render={(user) => user && <PersonHit key={user.id} user={user} />}
        />
      );
    case 'posts':
      return (
        <Paged
          result={posts}
          query={query}
          render={(hit) => <PostHitRow key={hit.id} hit={hit} />}
        />
      );
    case 'conversations':
      return (
        <Paged
          result={conversations}
          query={query}
          render={(hit) => <ConversationHitRow key={hit.id} hit={hit} />}
        />
      );
    case 'messages':
      return (
        <Paged
          result={messages}
          query={query}
          render={(hit) => <MessageHitRow key={hit.id} hit={hit} />}
        />
      );
  }
}

/**
 * Search everything you can see (spec §6): results deep-link to where they live. The query and
 * tab live in the address (`/search?q=…&type=…`), so a search can be shared or revisited.
 */
export function SearchPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const typeParam = params.get('type');
  const tab: Tab = TABS.find((item) => item.id === typeParam)?.id ?? 'all';
  const [input, setInput] = useState(urlQuery);
  const debounced = useDebounced(input, 300);
  // The query this page last wrote to the address.
  const written = useRef(urlQuery.trim());

  // Typing updates the address; replace, so Back leaves search instead of replaying keystrokes.
  useEffect(() => {
    const next = debounced.trim();
    if (next === written.current) return;
    written.current = next;
    router.replace(hrefFor(next, tab));
  }, [debounced, tab, router]);

  // Back/forward or a link changed the address: follow it.
  useEffect(() => {
    if (urlQuery.trim() === written.current) return;
    written.current = urlQuery.trim();
    setInput(urlQuery);
  }, [urlQuery]);

  const selectTab = (next: Tab) => router.replace(hrefFor(written.current, next));
  const query = urlQuery.trim();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <h1 className="sr-only">{t('search.title')}</h1>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.title')}
          autoFocus
          className="h-11 pl-11 text-base"
        />
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => selectTab(item.id)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === item.id
                ? 'border-accent text-fg'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {!searchable(query) ? (
          <EmptyState
            icon={Search}
            title={t('search.promptTitle')}
            description={t('search.promptDescription')}
          />
        ) : tab === 'all' ? (
          <Overview query={query} onTab={selectTab} />
        ) : (
          <KindResults kind={tab} query={query} />
        )}
      </div>
    </div>
  );
}
