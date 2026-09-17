'use client';

import { isApiError } from '@nexa/api-client';
import { MessageSquare, Pencil, UserX } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/ui/rich-text';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useMe } from '@/features/session/use-me';
import { useI18n } from '@/i18n/provider';
import { useMember, usePresence, useProfile } from './queries';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

/** A teammate's profile: who they are and where they sit, no cover photo by default (spec §6). */
export function Profile({ userId }: { userId: string }) {
  const { t, tryT, formatDate } = useI18n();
  const { data: me } = useMe();
  const profile = useProfile(userId);
  const membership = useMember(userId);
  const presence = usePresence([userId]);

  if (profile.isPending) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }
  if (profile.isError) {
    return isApiError(profile.error) && [400, 404].includes(profile.error.status) ? (
      <EmptyState
        icon={UserX}
        title={t('profile.notFoundTitle')}
        description={t('profile.notFoundDescription')}
      />
    ) : (
      <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
    );
  }

  const user = profile.data;
  const member = membership.data;
  const userDepartments = member?.departments ?? [];
  const online = presence.data?.[user.id] === 'online';
  const isMe = me?.id === user.id;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar
          name={user.display_name}
          src={user.avatar_url}
          size="xl"
          presence={online ? 'online' : 'offline'}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-semibold tracking-tight">{user.display_name}</h1>
          <p className="text-sm text-muted">
            @{user.username}
            {userDepartments.length > 0 && (
              <> · {userDepartments.map((item) => item.name).join(', ')}</>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={online ? 'text-success' : 'text-muted'}>
              {online ? t('people.online') : t('people.offline')}
            </span>
            {user.status === 'DEACTIVATED' && <Badge>{t('people.deactivated')}</Badge>}
            {member?.status === 'SUSPENDED' && (
              <Badge tone="warning">{t('people.suspended')}</Badge>
            )}
          </p>
        </div>
        {isMe ? (
          <Button asChild variant="secondary">
            <Link href="/settings">
              <Pencil aria-hidden />
              {t('profile.edit')}
            </Link>
          </Button>
        ) : (
          user.status === 'ACTIVE' && (
            <Button asChild>
              <Link href={`/messages?to=${user.id}`}>
                <MessageSquare aria-hidden />
                {t('profile.message')}
              </Link>
            </Button>
          )
        )}
      </header>

      <section aria-labelledby="profile-about">
        <h2 id="profile-about" className="mb-2 text-[13px] font-semibold">
          {t('profile.about')}
        </h2>
        {user.bio ? (
          <RichText text={user.bio} className="text-sm text-fg" />
        ) : (
          <p className="text-sm text-muted">{t('profile.noBio')}</p>
        )}
      </section>

      <section aria-labelledby="profile-details">
        <h2 id="profile-details" className="mb-1 text-[13px] font-semibold">
          {t('profile.details')}
        </h2>
        <dl className="divide-y divide-border border-y border-border">
          <Detail label={t('profile.email')}>
            <a href={`mailto:${user.email}`} className="hover:underline">
              {user.email}
            </a>
          </Detail>
          {member && (
            <Detail label={t('profile.role')}>
              {tryT(`organization.roles.${member.role}`) ?? member.role}
            </Detail>
          )}
          <Detail label={t('profile.departments')}>
            {userDepartments.length > 0
              ? userDepartments.map((item) => item.name).join(', ')
              : t('people.noDepartment')}
          </Detail>
          {member && <Detail label={t('profile.joined')}>{formatDate(member.joined_at)}</Detail>}
        </dl>
      </section>
    </div>
  );
}
