import { unwrap, unwrapBody } from '@nexa/api-client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';
import type { AppNotification } from '@/lib/chat-types';

type OrgKey = ReturnType<typeof useOrgKey>;

export type NotificationFilter = 'all' | 'unread';

interface NotificationPage {
  data: AppNotification[];
  pagination: { next_cursor: string | null; has_next: boolean; limit: number };
}

const PAGE_SIZE = 30;

/** Most recently active first; unread ones of the same kind arrive coalesced (ADR-016). */
export function useNotifications(filter: NotificationFilter) {
  const orgKey = useOrgKey();
  return useInfiniteQuery({
    queryKey: orgKey('notifications', 'list', filter),
    queryFn: ({ pageParam }): Promise<NotificationPage> =>
      unwrapBody(
        api.GET('/api/v1/notifications', {
          params: {
            query: {
              limit: PAGE_SIZE,
              unread_only: filter === 'unread' ? 'true' : 'false',
              ...(pageParam && { cursor: pageParam }),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.next_cursor,
  });
}

export function useUnreadNotificationCount() {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('notifications', 'unread-count'),
    queryFn: () => unwrap(api.GET('/api/v1/notifications/unread-count')),
    // Realtime events keep it current; polling only covers an event that never arrived.
    refetchInterval: 60_000,
  });
}

function markCachedRead(
  queryClient: QueryClient,
  orgKey: OrgKey,
  matches: (item: AppNotification) => boolean,
): void {
  const now = new Date().toISOString();
  queryClient.setQueriesData<InfiniteData<NotificationPage>>(
    { queryKey: orgKey('notifications', 'list') },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: page.data.map((item) =>
            !item.read && matches(item) ? { ...item, read: true, read_at: now } : item,
          ),
        })),
      },
  );
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.PATCH('/api/v1/notifications/{id}/read', { params: { path: { id } } })),
    // Optimistic, so the row settles at once even when opening it navigates away.
    onMutate: (id) => {
      markCachedRead(queryClient, orgKey, (item) => item.id === id);
      queryClient.setQueryData<{ unread_count: number }>(
        orgKey('notifications', 'unread-count'),
        (data) => data && { unread_count: Math.max(0, data.unread_count - 1) },
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orgKey('notifications', 'unread-count') }),
    onError: () => queryClient.invalidateQueries({ queryKey: orgKey('notifications') }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const orgKey = useOrgKey();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all')),
    onSuccess: () => {
      markCachedRead(queryClient, orgKey, () => true);
      queryClient.setQueryData(orgKey('notifications', 'unread-count'), { unread_count: 0 });
    },
  });
}
