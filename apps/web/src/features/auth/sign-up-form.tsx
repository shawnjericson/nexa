'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/input';
import { useI18n } from '@/i18n/provider';
import { describeError, fieldErrors } from '@/lib/api/errors';
import { signUp } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { GoogleButton } from './google-button';
import { safeNextPath } from './safe-next-path';

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  // Where to go afterwards, e.g. back to an invitation link that sent them here.
  const next = safeNextPath(useSearchParams().get('next'));
  const [form, setForm] = useState({ display_name: '', username: '', email: '', password: '' });

  const mutation = useMutation({
    mutationFn: () => signUp(form),
    onSuccess: () => router.replace(next),
  });
  const errors = fieldErrors(mutation.error);
  const hasFieldErrors = Object.keys(errors).length > 0;

  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [name]: event.target.value })),
    error: errors[name],
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-tight">{t('auth.signUpTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted">{t('auth.signUpSubtitle')}</p>

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
          label={t('auth.displayName')}
          autoComplete="name"
          required
          {...field('display_name')}
        />
        <TextField
          label={t('auth.username')}
          autoComplete="username"
          required
          hint={t('auth.usernameHint')}
          {...field('username')}
        />
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          {...field('email')}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          required
          hint={t('auth.passwordHint')}
          {...field('password')}
        />
        {mutation.isError && !hasFieldErrors && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {describeError(mutation.error, i18n)}
          </p>
        )}
        <Button type="submit" size="lg" loading={mutation.isPending} className="mt-2">
          {t('auth.signUp')}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-accent hover:underline"
        >
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
