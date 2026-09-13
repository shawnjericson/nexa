'use client';

import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { fold } from '@/lib/format';
import type { Department, Member, UserRef } from '@/lib/types';
import { useDepartments, useDepartmentsByUser, useMembers, usePresence } from './queries';

const NO_DEPARTMENT = '__none__';

type Person = Member & { user: UserRef };

function PersonRow({
  member,
  departments,
  online,
}: {
  member: Person;
  departments: Department[];
  online: boolean;
}) {
  const { t, tryT } = useI18n();
  const { user } = member;
  const context = [
    departments.map((department) => department.name).join(', '),
    tryT(`organization.roles.${member.role}`),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <Link
        href={`/people/${user.id}`}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-subtle"
      >
        <Avatar
          name={user.display_name}
          src={user.avatar_url}
          presence={online ? 'online' : 'offline'}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{user.display_name}</span>
          <span className="block truncate text-xs text-muted">{context}</span>
        </span>
        {user.deactivated ? (
          <Badge>{t('people.deactivated')}</Badge>
        ) : member.status === 'SUSPENDED' ? (
          <Badge tone="warning">{t('people.suspended')}</Badge>
        ) : (
          <span className={cn('hidden text-xs sm:inline', online ? 'text-success' : 'text-muted')}>
            {online ? t('people.online') : t('people.offline')}
          </span>
        )}
      </Link>
    </li>
  );
}

/** People grouped by department, with presence and accent-insensitive filtering (spec §6). */
export function PeopleDirectory() {
  const { t, tn } = useI18n();
  const { organization } = useOrganization();
  const members = useMembers();
  const departments = useDepartments();
  const { byUser } = useDepartmentsByUser(departments.data);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');

  const people = useMemo(
    () => (members.data ?? []).filter((member): member is Person => member.user !== null),
    [members.data],
  );
  const presence = usePresence(people.map((member) => member.user.id));

  const groups = useMemo(() => {
    const needle = fold(query.trim());
    const matches = people
      .filter(
        (member) =>
          !needle ||
          fold(member.user.display_name).includes(needle) ||
          fold(member.user.username).includes(needle),
      )
      .sort((a, b) => a.user.display_name.localeCompare(b.user.display_name));

    const sections = (departments.data ?? [])
      .filter((item) => !department || item.id === department)
      .map((item) => ({
        key: item.id,
        name: item.name,
        people: matches.filter((member) =>
          byUser.get(member.user.id)?.some((d) => d.id === item.id),
        ),
      }));
    if (!department || department === NO_DEPARTMENT) {
      sections.push({
        key: NO_DEPARTMENT,
        name: t('people.noDepartment'),
        people: matches.filter((member) => !byUser.get(member.user.id)?.length),
      });
    }
    return sections.filter((section) => section.people.length > 0);
  }, [people, departments.data, byUser, query, department, t]);

  const loading = members.isPending || departments.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <PageHeader
        title={t('people.title')}
        description={
          members.data
            ? tn('people.description', people.length, { organization: organization.name })
            : undefined
        }
      />

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('people.searchPlaceholder')}
            aria-label={t('people.searchLabel')}
            className="pl-9"
          />
        </div>
        {(departments.data?.length ?? 0) > 0 && (
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            aria-label={t('people.department')}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-fg"
          >
            <option value="">{t('people.allDepartments')}</option>
            {departments.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={NO_DEPARTMENT}>{t('people.noDepartment')}</option>
          </select>
        )}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-2">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState icon={Users} title={t('people.noResults', { query: query.trim() })} />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.name}>
                <h2 className="mb-1 flex items-baseline gap-2 px-2 text-[13px] font-semibold">
                  {group.name}
                  <span className="text-xs font-normal text-muted">
                    {tn('people.memberCount', group.people.length)}
                  </span>
                </h2>
                <ul>
                  {group.people.map((member) => (
                    <PersonRow
                      key={member.user.id}
                      member={member}
                      departments={byUser.get(member.user.id) ?? []}
                      online={presence.data?.[member.user.id] === 'online'}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
