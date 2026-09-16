'use client';

import { unwrap } from '@nexa/api-client';
import { useMutation } from '@tanstack/react-query';
import { Building2, MailOpen } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/input';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api/client';
import { describeError } from '@/lib/api/errors';

/** An invitation link pasted whole, or just the token out of it. */
function tokenOf(value: string): string {
  const text = value.trim();
  try {
    return new URL(text).searchParams.get('token') ?? text;
  } catch {
    return text;
  }
}

function Card({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <Icon className="size-5 text-accent" aria-hidden />
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4 flex flex-1 flex-col justify-end">{children}</div>
    </section>
  );
}

/**
 * What someone sees when they have an account but no workspace yet - which, once sign-up is
 * invite-only, is everyone on their first visit. Both ways in are here, including accepting an
 * invitation: that page lives inside the workspace shell, so without this the one flow that puts
 * you in an organization would need you to already be in one.
 */
export function Onboarding({ onJoined }: { onJoined(organizationId: string): void }) {
  const i18n = useI18n();
  const { t, tryT } = i18n;
  const router = useRouter();
  const params = useSearchParams();
  // Read once: the token is taken out of the address bar straight away, so it doesn't linger in
  // history or get shared by accident.
  const [invited] = useState(() => params.get('token') ?? '');
  const [name, setName] = useState('');
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    if (params.has('token')) router.replace('/home');
  }, [params, router]);

  const create = useMutation({
    mutationFn: (organizationName: string) =>
      unwrap(api.POST('/api/v1/organizations', { body: { name: organizationName } })),
    onSuccess: (organization) => {
      toast.success(t('organization.onboarding.created', { name: organization.name }));
      onJoined(organization.id);
    },
    onError: (error) => toast.error(describeError(error, i18n)),
  });

  const accept = useMutation({
    mutationFn: (token: string) =>
      unwrap(api.POST('/api/v1/invitations/accept', { body: { token } })),
    onSuccess: (result) => {
      toast.success(
        t('invite.accepted', {
          role: tryT(`organization.roles.${result.role}`) ?? result.role,
        }),
      );
      onJoined(result.organization_id);
    },
    onError: (error) => toast.error(describeError(error, i18n)),
  });

  const busy = create.isPending || accept.isPending;

  // Arrived from an invitation link: there is one obvious thing to do, so only offer that.
  if (invited) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <MailOpen className="size-8 text-accent" aria-hidden />
        <h1 className="text-title font-semibold tracking-tight">{t('invite.title')}</h1>
        <p className="text-sm text-muted">{t('invite.description')}</p>
        <Button className="mt-3" loading={accept.isPending} onClick={() => accept.mutate(invited)}>
          {t('invite.accept')}
        </Button>
      </div>
    );
  }

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length >= 2) create.mutate(name.trim());
  };
  const submitToken = (event: FormEvent) => {
    event.preventDefault();
    const token = tokenOf(pasted);
    if (token) accept.mutate(token);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10 md:px-8">
      <h1 className="text-title font-semibold tracking-tight">
        {t('organization.onboarding.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">{t('organization.onboarding.subtitle')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card
          icon={Building2}
          title={t('organization.onboarding.createTitle')}
          description={t('organization.onboarding.createDescription')}
        >
          <form onSubmit={submitName} className="flex flex-col gap-3">
            <TextField
              label={t('organization.onboarding.nameLabel')}
              placeholder={t('organization.onboarding.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="organization"
            />
            <Button
              type="submit"
              loading={create.isPending}
              disabled={busy || name.trim().length < 2}
            >
              {t('organization.onboarding.createAction')}
            </Button>
          </form>
        </Card>

        <Card
          icon={MailOpen}
          title={t('organization.onboarding.inviteTitle')}
          description={t('organization.onboarding.inviteDescription')}
        >
          <form onSubmit={submitToken} className="flex flex-col gap-3">
            <TextField
              label={t('organization.onboarding.tokenLabel')}
              placeholder={t('organization.onboarding.tokenPlaceholder')}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="secondary"
              loading={accept.isPending}
              disabled={busy || tokenOf(pasted).length === 0}
            >
              {t('invite.accept')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
