import { unwrap, unwrapBody } from '@nexa/api-client';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';
import type { Department, Member } from '@/lib/types';

// The API's page/limit lists allow at most 50 per page.
const MEMBER_PAGE_SIZE = 50;
const MAX_MEMBER_PAGES = 50;
const PRESENCE_BATCH = 100;

/** Every member of the active organization (the API pages them; this loads all pages). */
export function useMembers() {
  const { organization } = useOrganization();
  const orgKey = useOrgKey();
  return useQuery({
    queryKey: orgKey('members'),
    queryFn: async () => {
      const members: Member[] = [];
      for (let page = 1; page <= MAX_MEMBER_PAGES; page += 1) {
        const body = await unwrapBody(
          api.GET('/api/v1/organizations/{organizationId}/members', {
            params: {
              path: { organizationId: organization.id },
              query: { page, limit: MEMBER_PAGE_SIZE },
            },
          }),
        );
        members.push(...body.data);
        if (!body.pagination.has_next) break;
      }
      return members;
    },
    staleTime: 60_000,
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

/** userId -> the departments they belong to. */
export function useDepartmentsByUser(departments: Department[] | undefined) {
  const { organization } = useOrganization();
  const orgKey = useOrgKey();
  const results = useQueries({
    queries: (departments ?? []).map((department) => ({
      queryKey: orgKey('departments', department.id, 'members'),
      queryFn: () =>
        unwrap(
          api.GET('/api/v1/organizations/{organizationId}/departments/{departmentId}/members', {
            params: { path: { organizationId: organization.id, departmentId: department.id } },
          }),
        ),
      staleTime: 60_000,
    })),
  });

  // Cheap enough to rebuild on every render (a few departments, a few hundred people).
  const byUser = new Map<string, Department[]>();
  (departments ?? []).forEach((department, index) => {
    for (const user of results[index]?.data ?? []) {
      if (!user) continue;
      byUser.set(user.id, [...(byUser.get(user.id) ?? []), department]);
    }
  });

  return { byUser, loading: results.some((result) => result.isPending) };
}

/** Online status for up to a few hundred people, refreshed every minute. */
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
