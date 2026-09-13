'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/input';
import { useI18n } from '@/i18n/provider';
import { describeError, fieldErrors } from '@/lib/api/errors';
import { signIn } from '@/lib/auth/session';
import { safeNextPath } from './safe-next-path';

export function SignInForm() {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
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

  return (
    <div>
      <h1 className="text-title font-semibold tracking-tight">{t('auth.signInTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{t('auth.signInSubtitle')}</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
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
        <Link href="/register" className="font-medium text-accent hover:underline">
          {t('auth.signUp')}
        </Link>
      </p>
    </div>
  );
}
