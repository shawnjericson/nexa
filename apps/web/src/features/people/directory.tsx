'use client';

import { MessageSquare, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import type { Member, UserRef } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import { useDepartments, useMemberList, useMemberPage, usePresence } from './queries';

/** The API's filter for people in no department. */
const NO_DEPARTMENT = 'none';

type Person = Member & { user: UserRef };

function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors',
        active
          ? 'border-accent bg-accent-soft font-medium text-accent'
          : 'border-border text-muted hover:border-muted/40 hover:text-fg',
      )}
    >
      {children}
      {count !== undefined && <span className="text-xs opacity-70">{count}</span>}
    </button>
  );
}

function PersonCard({ member, online, isMe }: { member: Person; online: boolean; isMe: boolean }) {
  const { t, tryT } = useI18n();
  const { user } = member;
  const context = [
    member.departments.map((department) => department.name).join(', '),
    tryT(`organization.roles.${member.role}`),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/40">
      <div className="flex items-start gap-3">
        <Avatar
          name={user.display_name}
          src={user.avatar_url}
          size="lg"
          presence={online ? 'online' : 'offline'}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {/* The whole card opens the profile; the quick actions sit above it. */}
            <Link
              href={`/people/${user.id}`}
              className="min-w-0 truncate after:absolute after:inset-0 hover:underline"
            >
              {user.display_name}
            </Link>
            {isMe && <Badge>{t('common.you')}</Badge>}
          </p>
          <p className="truncate text-xs text-muted">@{user.username}</p>
          {context && <p className="mt-1 line-clamp-2 text-xs text-muted">{context}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {user.deactivated ? (
          <Badge>{t('people.deactivated')}</Badge>
        ) : member.status === 'SUSPENDED' ? (
          <Badge tone="warning">{t('people.suspended')}</Badge>
        ) : (
          <span className={cn('text-xs', online ? 'text-success' : 'text-muted')}>
            {online ? t('people.online') : t('people.offline')}
          </span>
        )}
        {!isMe && !user.deactivated && (
          <Button asChild variant="ghost" size="sm" className="relative z-10">
            <Link href={`/messages?to=${user.id}`}>
              <MessageSquare aria-hidden />
              {t('profile.message')}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Everyone in the organization: search without accents, filter by department (spec §6). The API
 * does the searching, filtering and sorting and sends 50 people at a time; the next 50 load when
 * the reader reaches the end, so a company of thousands opens as quickly as a team of ten.
 */
export function PeopleDirectory() {
  const { t, tn } = useI18n();
  const { organization } = useOrganization();
  const { data: me } = useMe();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const search = useDebounced(query.trim(), 250);
  const members = useMemberList({
    q: search,
    departmentId: department || undefined,
    sort: 'name',
  });
  const everyone = useMemberPage({ limit: 1 });
  const unplaced = useMemberPage({ departmentId: NO_DEPARTMENT, limit: 1 });
  const departments = useDepartments();
  const more = useRef<HTMLDivElement>(null);

  const people = useMemo(
    () =>
      (members.data?.pages ?? [])
        .flatMap((page) => page.data)
        .filter((member): member is Person => member.user !== null),
    [members.data],
  );
  const presence = usePresence(people.map((member) => member.user.id));
  const total = everyone.data?.pagination.total;
  const withoutDepartment = unplaced.data?.pagination.total ?? 0;

  // The next page when the end of the list scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = members;
  useEffect(() => {
    const element = more.current;
    if (!element || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <PageHeader
        title={t('people.title')}
        description={
          total !== undefined
            ? tn('people.description', total, { organization: organization.name })
            : undefined
        }
      />

      <div className="relative mt-5 max-w-md">
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
        <div
          role="group"
          aria-label={t('people.department')}
          className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
        >
          <Chip active={department === ''} count={total} onClick={() => setDepartment('')}>
            {t('people.allDepartments')}
          </Chip>
          {departments.data?.map((item) => (
            <Chip
              key={item.id}
              active={department === item.id}
              count={item.member_count}
              onClick={() => setDepartment(item.id)}
            >
              {item.name}
            </Chip>
          ))}
          {withoutDepartment > 0 && (
            <Chip
              active={department === NO_DEPARTMENT}
              count={withoutDepartment}
              onClick={() => setDepartment(NO_DEPARTMENT)}
            >
              {t('people.noDepartment')}
            </Chip>
          )}
        </div>
      )}

      <div className="mt-5" aria-busy={members.isFetching}>
        {members.isPending ? (
          <PeopleSkeleton />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : people.length === 0 ? (
          <EmptyState icon={Users} title={t('people.noResults', { query: search })} />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {people.map((member) => (
                <PersonCard
                  key={member.user.id}
                  member={member}
                  online={presence.data?.[member.user.id] === 'online'}
                  isMe={member.user.id === me?.id}
                />
              ))}
            </ul>
            <div ref={more} className="mt-4 flex justify-center">
              {hasNextPage && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {t('people.loadMore')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="rounded-xl border border-border p-4" aria-hidden>
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}
