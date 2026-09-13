'use client';

import { MailOpen, MailX } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { useAcceptInvitation } from './queries';

/**
 * Opened from an invitation link (/invite?token=…). The token is read once and then removed from
 * the address bar, so it doesn't linger in history or get shared by accident.
 */
export function AcceptInvitation() {
  const i18n = useI18n();
  const { t, tryT } = i18n;
  const router = useRouter();
  const params = useSearchParams();
  const { switchTo } = useOrganization();
  const accept = useAcceptInvitation();
  const [token] = useState(() => params.get('token') ?? '');

  useEffect(() => {
    if (params.has('token')) router.replace('/invite');
  }, [params, router]);

  if (!token) {
    return (
      <EmptyState
        className="py-24"
        icon={MailX}
        title={t('invite.invalidTitle')}
        description={t('invite.invalidDescription')}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <MailOpen className="size-8 text-accent" aria-hidden />
      <h1 className="text-title font-semibold tracking-tight">{t('invite.title')}</h1>
      <p className="text-sm text-muted">{t('invite.description')}</p>
      {accept.isError && (
        <p role="alert" className="text-sm text-danger">
          {describeError(accept.error, i18n)}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" onClick={() => router.push('/home')}>
          {t('invite.later')}
        </Button>
        <Button
          loading={accept.isPending}
          onClick={() =>
            accept.mutate(token, {
              // The organizations list is already fresh here, so switching finds the new one.
              onSuccess: (result) => {
                switchTo(result.organization_id);
                toast.success(
                  t('invite.accepted', {
                    role: tryT(`organization.roles.${result.role}`) ?? result.role,
                  }),
                );
                router.push('/home');
              },
            })
          }
        >
          {t('invite.accept')}
        </Button>
      </div>
    </div>
  );
}
