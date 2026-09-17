import { unwrap, unwrapBody } from '@nexa/api-client';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';

// The API's page/limit lists allow at most 50 per page.
export const MEMBER_PAGE_SIZE = 50;
const PRESENCE_BATCH = 100;

export interface MemberQuery {
  /** Name or username; the API ignores accents and matches word prefixes. */
  q?: string;
  /** A department id, or 'none' for people in no department. */
  departmentId?: string;
  sort?: 'joined' | 'newest' | 'name';
}

function useMembersRequest() {
  const { organization } = useOrganization();
  return ({ q, departmentId, sort = 'name' }: MemberQuery, page: number, limit: number) =>
    unwrapBody(
      api.GET('/api/v1/organizations/{organizationId}/members', {
        params: {
          path: { organizationId: organization.id },
          query: {
            page,
            limit,
            sort,
            ...(q?.trim() && { q: q.trim() }),
            ...(departmentId && { department_id: departmentId }),
          },
        },
      }),
    );
}

/**
 * One page of members, searched, filtered and sorted by the API. An organization can have
 * thousands of people, so nothing here ever asks for all of them.
 */
export function useMemberPage(
  query: MemberQuery & { page?: number; limit?: number },
  options: { enabled?: boolean } = {},
) {
  const orgKey = useOrgKey();
  const request = useMembersRequest();
  const { page = 1, limit = MEMBER_PAGE_SIZE, ...filter } = query;
  return useQuery({
    queryKey: orgKey('members', 'page', filter, page, limit),
    queryFn: () => request(filter, page, limit),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

/** The directory: a page of 50 at a time, the next one when the reader gets there. */
export function useMemberList(filter: MemberQuery) {
  const orgKey = useOrgKey();
  const request = useMembersRequest();
  return useInfiniteQuery({
    queryKey: orgKey('members', 'list', filter),
    queryFn: ({ pageParam }) => request(filter, pageParam, MEMBER_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.has_next ? last.pagination.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** One person's membership: role, status, joining date and departments. */
export function useMember(userId: string) {
  const { organization } = useOrganization();
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('members', 'one', userId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{organizationId}/members/{userId}', {
          params: { path: { organizationId: organization.id, userId } },
        }),
      ),
    retry: false,
  });
}

export function useDepartments() {
  const { organization } = useOrganization();
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('departments'),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{organizationId}/departments', {
          params: { path: { organizationId: organization.id } },
        }),
      ),
    staleTime: 60_000,
  });
}

/** Online status for the people on screen, refreshed every minute. */
export function usePresence(userIds: string[]) {
  const orgKey = useOrgKey();
  const sorted = useMemo(() => [...new Set(userIds)].sort(), [userIds]);
  return useQuery({
    queryKey: orgKey('presence', sorted.join(',')),
    queryFn: async () => {
      const statuses: Record<string, string> = {};
      for (let start = 0; start < sorted.length; start += PRESENCE_BATCH) {
        const batch = sorted.slice(start, start + PRESENCE_BATCH);
        Object.assign(
          statuses,
          await unwrap(
            api.GET('/api/v1/presence', { params: { query: { user_ids: batch.join(',') } } }),
          ),
        );
      }
      return statuses;
    },
    enabled: sorted.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

/** How many other people in the organization are online, however many people it has. */
export function useOnlineCount() {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('presence', 'online-count'),
    queryFn: () => unwrap(api.GET('/api/v1/presence/online-count')),
    refetchInterval: 60_000,
  });
}

export function useProfile(userId: string) {
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('profile', userId),
    queryFn: () => unwrap(api.GET('/api/v1/users/{id}', { params: { path: { id: userId } } })),
  });
}
