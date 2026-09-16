'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { completeAccountLink, pendingAccountLink } from '@/lib/auth/session';
import { GoogleMark } from './google-button';

/**
 * The email of the Google account already belongs to a NEXA account. Confirming that account's
 * password once connects the two (ADR-020): without it, registering someone else's email in
 * advance would hand over their Google sign-in.
 */
export function ConnectGoogleForm({ next }: { next: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [pending, setPending] = useState<{ email: string } | null | undefined>(undefined);
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => completeAccountLink(password),
    onSuccess: () => router.replace(next),
  });

  useEffect(() => {
    pendingAccountLink().then(setPending, () => setPending(null));
  }, []);

  if (pending === undefined) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-6 h-10 w-full" />
      </div>
    );
  }

  if (pending === null) {
    return (
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">
          {t('auth.connectExpiredTitle')}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{t('auth.connectExpired')}</p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/login">{t('auth.backToSignIn')}</Link>
        </Button>
      </div>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <div>
      <GoogleMark className="size-8" />
      <h1 className="mt-4 text-[26px] font-semibold tracking-tight">{t('auth.connectTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted">
        {t('auth.connectDescription', { email: pending.email })}
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mutation.isError && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {describeError(mutation.error, i18n)}
          </p>
        )}
        <Button type="submit" size="lg" loading={mutation.isPending} className="mt-2">
          {t('auth.connect')}
        </Button>
      </form>

      <p className="mt-6 text-sm">
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
