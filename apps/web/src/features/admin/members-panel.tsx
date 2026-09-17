'use client';

import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  UserCheck,
  UserMinus,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useMemberPage } from '@/features/people/queries';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { can, canAssignRole, canManageMember, isRole, ROLES, type Role } from '@/lib/permissions';
import type { Member, UserRef } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import { useRemoveMember, useUpdateMember } from './queries';

type Person = Member & { user: UserRef };

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Everyone in the organization with their role and status, a page at a time and searched by the
 * API. Actions follow the API's rules: nobody acts on a peer or a superior, or hands out more
 * power than they hold.
 */
export function MembersPanel() {
  const i18n = useI18n();
  const { t, tn, tryT, formatDate } = i18n;
  const { organization } = useOrganization();
  const { data: me } = useMe();
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(query.trim(), 250);
  const members = useMemberPage({ q: search, sort: 'name', page });
  const [removing, setRemoving] = useState<Person | null>(null);

  const actor = organization.role;
  const mayChangeRole = can(actor, 'member.role.update');
  const mayRemove = can(actor, 'member.remove');
  const roleName = (role: string) => tryT(`organization.roles.${role}`) ?? role;

  function changeRole(member: Person, role: Role) {
    if (role === member.role) return;
    update.mutate(
      { userId: member.user.id, role },
      {
        onSuccess: () =>
          toast.success(
            t('admin.roleChanged', { name: member.user.display_name, role: roleName(role) }),
          ),
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  function setStatus(member: Person, status: 'ACTIVE' | 'SUSPENDED') {
    update.mutate(
      { userId: member.user.id, status },
      {
        onSuccess: () =>
          toast.success(
            t(status === 'SUSPENDED' ? 'admin.suspended' : 'admin.reactivated', {
              name: member.user.display_name,
            }),
          ),
        onError: (error) => toast.error(describeError(error, i18n)),
      },
    );
  }

  if (members.isPending) return <RowsSkeleton />;
  if (members.isError)
    return <ErrorState error={members.error} onRetry={() => members.refetch()} />;

  const people = members.data.data.filter((member): member is Person => member.user !== null);
  const { total, total_pages: pages } = members.data.pagination;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={t('admin.searchMembers')}
            aria-label={t('admin.searchMembers')}
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted">{tn('people.memberCount', total)}</p>
      </div>

      {people.length === 0 ? (
        <EmptyState icon={Search} title={t('people.noResults', { query: search })} />
      ) : (
        <ul className="-mx-3 flex flex-col divide-y divide-border">
          {people.map((member) => {
            const isMe = member.user.id === me?.id;
            const manageable =
              !isMe && canManageMember(actor, member.role) && (mayChangeRole || mayRemove);
            return (
              <li key={member.user.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={member.user.display_name} src={member.user.avatar_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{member.user.display_name}</span>
                    {isMe && <Badge>{t('common.you')}</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{member.user.username} ·{' '}
                    {t('admin.joined', { date: formatDate(member.joined_at) })}
                  </p>
                </div>
                {member.user.deactivated ? (
                  <Badge>{t('people.deactivated')}</Badge>
                ) : (
                  member.status === 'SUSPENDED' && (
                    <Badge tone="warning">{t('people.suspended')}</Badge>
                  )
                )}
                <Badge
                  tone={member.role === 'OWNER' || member.role === 'ADMIN' ? 'accent' : 'neutral'}
                >
                  {roleName(member.role)}
                </Badge>
                {manageable ? (
                  <Menu>
                    <MenuTrigger
                      aria-label={t('admin.memberActions', { name: member.user.display_name })}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-fg"
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </MenuTrigger>
                    <MenuContent align="end" className="w-56">
                      {mayChangeRole && (
                        <>
                          <MenuLabel>{t('admin.changeRole')}</MenuLabel>
                          <MenuRadioGroup
                            value={member.role}
                            onValueChange={(value) => {
                              if (isRole(value)) changeRole(member, value);
                            }}
                          >
                            {ROLES.map((role) => (
                              <MenuRadioItem
                                key={role}
                                value={role}
                                disabled={!canAssignRole(actor, role)}
                              >
                                {roleName(role)}
                              </MenuRadioItem>
                            ))}
                          </MenuRadioGroup>
                        </>
                      )}
                      {mayRemove && (
                        <>
                          {mayChangeRole && <MenuSeparator />}
                          {member.status === 'SUSPENDED' ? (
                            <MenuItem onSelect={() => setStatus(member, 'ACTIVE')}>
                              <UserCheck aria-hidden />
                              {t('admin.reactivate')}
                            </MenuItem>
                          ) : (
                            <MenuItem onSelect={() => setStatus(member, 'SUSPENDED')}>
                              <UserX aria-hidden />
                              {t('admin.suspend')}
                            </MenuItem>
                          )}
                          <MenuItem destructive onSelect={() => setRemoving(member)}>
                            <UserMinus aria-hidden />
                            {t('admin.remove')}
                          </MenuItem>
                        </>
                      )}
                    </MenuContent>
                  </Menu>
                ) : (
                  <span className="size-8 shrink-0" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav
          aria-label={t('admin.pages')}
          className="flex items-center justify-end gap-2 text-xs text-muted"
        >
          {t('admin.pageOf', { page, pages })}
          <IconButton
            label={t('admin.previousPage')}
            icon={ChevronLeft}
            size="icon-sm"
            disabled={page <= 1 || members.isFetching}
            onClick={() => setPage((current) => current - 1)}
          />
          <IconButton
            label={t('admin.nextPage')}
            icon={ChevronRight}
            size="icon-sm"
            disabled={page >= pages || members.isFetching}
            onClick={() => setPage((current) => current + 1)}
          />
        </nav>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t('admin.removeTitle', { name: removing?.user.display_name ?? '' })}
        description={t('admin.removeDescription')}
        confirmLabel={t('admin.remove')}
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.user.id, {
            onSuccess: () => {
              toast.success(t('admin.removed', { name: removing.user.display_name }));
              setRemoving(null);
            },
            onError: (error) => toast.error(describeError(error, i18n)),
          });
        }}
      />
    </div>
  );
}
