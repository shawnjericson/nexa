'use client';

import { isApiError } from '@nexa/api-client';
import { History } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useI18n } from '@/i18n/provider';
import { RowsSkeleton } from './members-panel';
import { useAuditLog } from './queries';

/** The audited events (apps/api administration/application/audited-events.ts). */
const ACTIONS = [
  'organization.created',
  'organization.updated',
  'organization.member_invited',
  'organization.member_joined',
  'organization.member_updated',
  'organization.member_removed',
  'organization.department_created',
  'organization.department_deleted',
  'social.post_deleted',
  'social.comment_deleted',
  'communication.message_deleted',
] as const;

// Dictionary keys can't contain dots, which separate their levels.
const actionKey = (action: string) => `admin.auditActions.${action.replace(/\./g, '_')}`;

/** Plain values recorded with the event (roles, emails, names…), shown as key/value chips. */
function Details({ metadata }: { metadata: Record<string, unknown> }) {
  const { tryT } = useI18n();
  const entries = Object.entries(metadata).filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value),
  );
  if (entries.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[11px]"
        >
          <dt className="text-muted">{key}</dt>
          <dd className="truncate font-medium text-fg">
            {typeof value === 'string'
              ? (tryT(`organization.roles.${value}`) ?? value)
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Administrative and moderation actions, newest first, filterable by kind (audit.read). */
export function AuditPanel() {
  const { t, tryT, formatDate, formatRelative } = useI18n();
  const selectId = useId();
  const [action, setAction] = useState('');
  const log = useAuditLog(action || null);

  const unavailable = log.isError && isApiError(log.error) && log.error.status === 503;
  const entries = log.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('admin.auditDescription')}</p>
        <div>
          <label htmlFor={selectId} className="sr-only">
            {t('admin.filterActions')}
          </label>
          <Select
            id={selectId}
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="w-auto"
          >
            <option value="">{t('admin.allActions')}</option>
            {ACTIONS.map((item) => (
              <option key={item} value={item}>
                {tryT(actionKey(item)) ?? item}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {log.isPending ? (
        <RowsSkeleton />
      ) : unavailable ? (
        <EmptyState
          icon={History}
          title={t('admin.auditUnavailable')}
          description={t('admin.auditUnavailableDescription')}
        />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState icon={History} title={t('admin.noAudit')} />
      ) : (
        <ol className="-mx-3 flex flex-col divide-y divide-border">
          {entries.map((entry) => {
            const actor = entry.actor?.display_name ?? t('admin.system');
            const subject = entry.subject?.display_name;
            return (
              <li key={entry.id} className="flex items-start gap-3 px-3 py-3">
                <Avatar name={actor} src={entry.actor?.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{actor}</span>{' '}
                    <span className="text-muted">
                      {tryT(actionKey(entry.action)) ?? entry.action}
                    </span>
                    {subject && subject !== actor && (
                      <>
                        {' · '}
                        <span className="font-medium">{subject}</span>
                      </>
                    )}
                  </p>
                  <Details metadata={entry.metadata} />
                </div>
                <time
                  dateTime={entry.occurred_at}
                  title={formatDate(entry.occurred_at, { dateStyle: 'long', timeStyle: 'medium' })}
                  className="shrink-0 text-xs text-muted"
                >
                  {formatRelative(entry.occurred_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}

      {log.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            loading={log.isFetchingNextPage}
            onClick={() => log.fetchNextPage()}
          >
            {t('admin.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
