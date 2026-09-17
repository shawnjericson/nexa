import { ApiError, isApiError, unwrap, unwrapBody, type components } from '@nexa/api-client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useOrganization, useOrgKey } from '@/features/organization/organization-provider';
import { api } from '@/lib/api/client';
import type { Role } from '@/lib/permissions';

type Schemas = components['schemas'];
export type Invitation = Schemas['Invitation'];
export type CreatedInvitation = Schemas['CreatedInvitation'];
export type AuditEntry = Schemas['AuditEntry'];
type OrgKey = ReturnType<typeof useOrgKey>;

const AUDIT_PAGE_SIZE = 30;

/** For requests whose answer isn't needed: throws the API's error, ignores the body. */
async function perform(request: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await request;
  if (error !== undefined || !response.ok) throw ApiError.fromBody(error, response.status);
}

function useScope() {
  const { organization } = useOrganization();
  return { organizationId: organization.id, orgKey: useOrgKey(), queryClient: useQueryClient() };
}

function refreshMembers(queryClient: QueryClient, orgKey: OrgKey) {
  void queryClient.invalidateQueries({ queryKey: orgKey('members') });
  // Your own role or membership may be what changed.
  void queryClient.invalidateQueries({ queryKey: ['organizations'] });
}

export function useUpdateMember() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: ({
      userId,
      ...body
    }: {
      userId: string;
      role?: Role;
      status?: 'ACTIVE' | 'SUSPENDED';
    }) =>
      perform(
        api.PATCH('/api/v1/organizations/{organizationId}/members/{userId}', {
          params: { path: { organizationId, userId } },
          body,
        }),
      ),
    onSuccess: () => refreshMembers(queryClient, orgKey),
  });
}

export function useRemoveMember() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: (userId: string) =>
      perform(
        api.DELETE('/api/v1/organizations/{organizationId}/members/{userId}', {
          params: { path: { organizationId, userId } },
        }),
      ),
    onSuccess: () => refreshMembers(queryClient, orgKey),
  });
}

/** Pending invitations (member.invite). */
export function useInvitations(enabled: boolean) {
  const { organizationId, orgKey } = useScope();
  return useQuery({
    queryKey: orgKey('invitations'),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{organizationId}/invitations', {
          params: { path: { organizationId } },
        }),
      ),
    enabled,
  });
}

/** The answer carries the invitation token, shown once: only its hash is stored. */
export function useCreateInvitation() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      unwrap(
        api.POST('/api/v1/organizations/{organizationId}/invitations', {
          params: { path: { organizationId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKey('invitations') }),
  });
}

export function useRevokeInvitation() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: (invitationId: string) =>
      perform(
        api.DELETE('/api/v1/organizations/{organizationId}/invitations/{invitationId}', {
          params: { path: { organizationId, invitationId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKey('invitations') }),
  });
}

function refreshDepartments(queryClient: QueryClient, orgKey: OrgKey) {
  // Members carry their departments, and the directory filters by them.
  void queryClient.invalidateQueries({ queryKey: orgKey('members') });
  // Also refreshes every department's member list (their keys start the same way).
  return queryClient.invalidateQueries({ queryKey: orgKey('departments') });
}

export function useCreateDepartment() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: (body: { name: string; description: string | null }) =>
      perform(
        api.POST('/api/v1/organizations/{organizationId}/departments', {
          params: { path: { organizationId } },
          body,
        }),
      ),
    onSuccess: () => refreshDepartments(queryClient, orgKey),
  });
}

export function useUpdateDepartment() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: ({
      departmentId,
      ...body
    }: {
      departmentId: string;
      name: string;
      description: string | null;
    }) =>
      perform(
        api.PUT('/api/v1/organizations/{organizationId}/departments/{departmentId}', {
          params: { path: { organizationId, departmentId } },
          body,
        }),
      ),
    onSuccess: () => refreshDepartments(queryClient, orgKey),
  });
}

export function useDeleteDepartment() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: (departmentId: string) =>
      perform(
        api.DELETE('/api/v1/organizations/{organizationId}/departments/{departmentId}', {
          params: { path: { organizationId, departmentId } },
        }),
      ),
    onSuccess: () => refreshDepartments(queryClient, orgKey),
  });
}

/** Same cache entry as the directory's department lists. */
export function useDepartmentMembers(departmentId: string) {
  const { organizationId, orgKey } = useScope();
  return useQuery({
    queryKey: orgKey('departments', departmentId, 'members'),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{organizationId}/departments/{departmentId}/members', {
          params: { path: { organizationId, departmentId } },
        }),
      ),
  });
}

export function useAddDepartmentMember() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: ({ departmentId, userId }: { departmentId: string; userId: string }) =>
      perform(
        api.PUT(
          '/api/v1/organizations/{organizationId}/departments/{departmentId}/members/{userId}',
          { params: { path: { organizationId, departmentId, userId } } },
        ),
      ),
    onSuccess: () => refreshDepartments(queryClient, orgKey),
  });
}

export function useRemoveDepartmentMember() {
  const { organizationId, orgKey, queryClient } = useScope();
  return useMutation({
    mutationFn: ({ departmentId, userId }: { departmentId: string; userId: string }) =>
      perform(
        api.DELETE(
          '/api/v1/organizations/{organizationId}/departments/{departmentId}/members/{userId}',
          { params: { path: { organizationId, departmentId, userId } } },
        ),
      ),
    onSuccess: () => refreshDepartments(queryClient, orgKey),
  });
}

/** Newest first; `action` narrows it to one kind of event. */
export function useAuditLog(action: string | null) {
  const { orgKey } = useScope();
  return useInfiniteQuery({
    queryKey: orgKey('audit', action ?? 'all'),
    queryFn: ({ pageParam }) =>
      unwrapBody(
        api.GET('/api/v1/audit-logs', {
          params: {
            query: {
              limit: AUDIT_PAGE_SIZE,
              ...(action && { action }),
              ...(pageParam && { cursor: pageParam }),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.next_cursor,
    // 503: this server keeps no audit log. Retrying won't change that.
    retry: (count, error) => !(isApiError(error) && error.status === 503) && count < 2,
  });
}

export function useUpdateOrganization() {
  const { organizationId, queryClient } = useScope();
  return useMutation({
    mutationFn: (body: { name?: string; timezone?: string; logo_url?: string | null }) =>
      perform(
        api.PUT('/api/v1/organizations/{organizationId}', {
          params: { path: { organizationId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

/** Joins the inviting organization; the organizations list is fresh before callers continue. */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      unwrap(api.POST('/api/v1/invitations/accept', { body: { token } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
