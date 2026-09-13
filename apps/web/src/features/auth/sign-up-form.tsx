'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/input';
import { useI18n } from '@/i18n/provider';
import { describeError, fieldErrors } from '@/lib/api/errors';
import { signUp } from '@/lib/auth/session';

export function SignUpForm() {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [form, setForm] = useState({ display_name: '', username: '', email: '', password: '' });

  const mutation = useMutation({
    mutationFn: () => signUp(form),
    onSuccess: () => router.replace('/home'),
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
      <h1 className="text-title font-semibold tracking-tight">{t('auth.signUpTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{t('auth.signUpSubtitle')}</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
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
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
