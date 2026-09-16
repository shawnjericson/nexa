'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/input';
import { useI18n } from '@/i18n/provider';
import { describeError, fieldErrors } from '@/lib/api/errors';
import { signIn } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { ConnectGoogleForm } from './connect-google-form';
import { GoogleButton } from './google-button';
import { safeNextPath } from './safe-next-path';

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const i18n = useI18n();
  const { t, tryT } = i18n;
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const ssoError = params.get('sso_error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => signIn({ email, password }),
    onSuccess: () => router.replace(next),
  });
  const errors = fieldErrors(mutation.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  // Google sent us back with an email that already has a NEXA account.
  if (params.get('connect') === 'google') return <ConnectGoogleForm next={next} />;

  return (
    <div>
      <p className="text-sm text-muted">{t('auth.welcomeBack')}</p>
      <h1 className="mt-1 text-[26px] font-semibold tracking-tight">{t('auth.signInTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted">{t('auth.signInSubtitle')}</p>

      {ssoError && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {ssoError === 'CANCELLED'
            ? t('auth.ssoCancelled')
            : (tryT(`errors.codes.${ssoError}`) ?? t('auth.ssoFailed'))}
        </p>
      )}

      {googleEnabled && (
        <>
          <div className="mt-6">
            <GoogleButton next={next} label={t('auth.continueWithGoogle')} />
          </div>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">{t('auth.orContinueWith')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form
        onSubmit={submit}
        className={cn('flex flex-col gap-4', !googleEnabled && 'mt-8')}
        noValidate
      >
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />
        {mutation.isError && !errors.email && !errors.password && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {describeError(mutation.error, i18n)}
          </p>
        )}
        <Button type="submit" size="lg" loading={mutation.isPending} className="mt-2">
          {t('auth.signIn')}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {t('auth.noAccount')}{' '}
        {/* Keeps ?next= so an invitation link still works after signing up first. */}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="font-medium text-accent hover:underline"
        >
          {t('auth.signUp')}
        </Link>
      </p>
    </div>
  );
}
