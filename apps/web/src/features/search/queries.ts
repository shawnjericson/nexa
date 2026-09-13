import { unwrap, unwrapBody, type components } from '@nexa/api-client';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';

type Schemas = components['schemas'];
export type PostHit = Schemas['PostSearchHit'];
export type ConversationHit = Schemas['ConversationSearchHit'];
export type MessageHit = Schemas['MessageSearchHit'];
export type SearchKind = 'people' | 'posts' | 'conversations' | 'messages';

/** Every word matches as a prefix, so a single character matches almost everything. */
export const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 20;

export const searchable = (query: string) => query.trim().length >= MIN_QUERY_LENGTH;

/** The best few results of every kind; the API only searches what the caller can see. */
export function useSearchOverview(query: string, limit: number, enabled = true) {
  const orgKey = useOrgKey();
  const q = query.trim();
  return useQuery({
    queryKey: orgKey('search', 'overview', q, limit),
    queryFn: () => unwrap(api.GET('/api/v1/search', { params: { query: { q, limit } } })),
    enabled: enabled && searchable(q),
    // Keep showing the last results while the next query loads, so typing doesn't flicker.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

interface Page<T> {
  data: T[];
  pagination: { next_cursor: string | null; has_next: boolean };
}

type PageQuery = { q: string; limit: number; cursor?: string };

function useSearchPages<T>(
  kind: SearchKind,
  query: string,
  enabled: boolean,
  fetchPage: (query: PageQuery) => Promise<Page<T>>,
) {
  const orgKey = useOrgKey();
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: orgKey('search', kind, q),
    queryFn: ({ pageParam }) =>
      fetchPage({ q, limit: PAGE_SIZE, ...(pageParam && { cursor: pageParam }) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.next_cursor,
    enabled: enabled && searchable(q),
    staleTime: 30_000,
  });
}

export const useSearchPeople = (query: string, enabled: boolean) =>
  useSearchPages('people', query, enabled, (params) =>
    unwrapBody(api.GET('/api/v1/search/people', { params: { query: params } })),
  );

export const useSearchPosts = (query: string, enabled: boolean) =>
  useSearchPages('posts', query, enabled, (params) =>
    unwrapBody(api.GET('/api/v1/search/posts', { params: { query: params } })),
  );

export const useSearchConversations = (query: string, enabled: boolean) =>
  useSearchPages('conversations', query, enabled, (params) =>
    unwrapBody(api.GET('/api/v1/search/conversations', { params: { query: params } })),
  );

export const useSearchMessages = (query: string, enabled: boolean) =>
  useSearchPages('messages', query, enabled, (params) =>
    unwrapBody(api.GET('/api/v1/search/messages', { params: { query: params } })),
  );
