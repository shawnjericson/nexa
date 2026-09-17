'use client';

import { isApiError, type components } from '@nexa/api-client';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea, TextField } from '@/components/ui/input';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useMe } from '@/features/session/use-me';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/config';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { isGuestEmail } from '@/lib/guest';
import { cn } from '@/lib/cn';
import { AvatarField } from './avatar-field';
import { useChangePassword, useUpdateMe, type UpdateMeInput } from './queries';

type Me = components['schemas']['Me'];

// Mirrors the API's rules so most mistakes are caught before a round trip.
const USERNAME = /^[a-zA-Z0-9._-]{3,30}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD_BYTES = 72;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface p-5 md:p-6">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const i18n = useI18n();
  const { t } = i18n;
  const update = useUpdateMe();
  const bioId = useId();
  const [displayName, setDisplayName] = useState(me.display_name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? '');
  const [errors, setErrors] = useState<Partial<Record<'displayName' | 'username', string>>>({});

  const changes: UpdateMeInput = {};
  if (displayName.trim() !== me.display_name) changes.display_name = displayName.trim();
  if (username.trim() !== me.username) changes.username = username.trim();
  if ((bio.trim() || null) !== me.bio) changes.bio = bio.trim() || null;
  const dirty = Object.keys(changes).length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!displayName.trim()) found.displayName = t('settings.required');
    if (!USERNAME.test(username.trim())) found.username = t('settings.invalidUsername');
    setErrors(found);
    if (!dirty || Object.keys(found).length > 0) return;

    update.mutate(changes, {
      onSuccess: () => toast.success(t('settings.profileSaved')),
      onError: (error) => {
        if (isApiError(error) && error.code === 'USERNAME_TAKEN') {
          setErrors({ username: describeError(error, i18n) });
        } else {
          toast.error(describeError(error, i18n));
        }
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AvatarField me={me} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('settings.displayName')}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={errors.displayName}
          maxLength={100}
          autoComplete="name"
        />
        <TextField
          label={t('settings.username')}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={errors.username}
          hint={t('auth.usernameHint')}
          maxLength={30}
          autoComplete="username"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={bioId} className="text-[13px] font-medium text-fg">
          {t('settings.bio')}
        </label>
        <Textarea
          id={bioId}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder={t('settings.bioPlaceholder')}
          maxLength={500}
          rows={3}
        />
      </div>
      <Button type="submit" className="self-start" disabled={!dirty} loading={update.isPending}>
        {t('settings.saveProfile')}
      </Button>
    </form>
  );
}

function PasswordForm({ email }: { email: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'current' | 'next' | 'confirm', string>>>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!current) found.current = t('settings.required');
    if (next.length < MIN_PASSWORD) found.next = t('settings.passwordTooShort');
    else if (new TextEncoder().encode(next).length > MAX_PASSWORD_BYTES) {
      found.next = t('settings.passwordTooLong');
    } else if (next === current) found.next = t('settings.passwordSame');
    if (confirm !== next) found.confirm = t('settings.passwordMismatch');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          toast.success(t('settings.passwordChanged'));
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'INVALID_CURRENT_PASSWORD') {
            setErrors({ current: describeError(error, i18n) });
          } else {
            toast.error(describeError(error, i18n));
          }
        },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-sm flex-col gap-4">
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <TextField
        type="password"
        label={t('settings.currentPassword')}
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        error={errors.current}
        autoComplete="current-password"
      />
      <TextField
        type="password"
        label={t('settings.newPassword')}
        value={next}
        onChange={(event) => setNext(event.target.value)}
        error={errors.next}
        hint={t('auth.passwordHint')}
        autoComplete="new-password"
      />
      <TextField
        type="password"
        label={t('settings.confirmPassword')}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={errors.confirm}
        autoComplete="new-password"
      />
      <Button
        type="submit"
        className="self-start"
        disabled={!current || !next || !confirm}
        loading={change.isPending}
      >
        {t('settings.changePassword')}
      </Button>
    </form>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: LucideIcon; lang?: string }>;
  onChange(value: T): void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span id={id} className="text-[13px] font-medium text-fg">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="inline-flex self-start rounded-lg bg-surface-subtle p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            lang={option.lang}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
              value === option.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {option.icon && <option.icon className="size-3.5" aria-hidden />}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Preferences() {
  const { t, locale, setLocale } = useI18n();
  const { theme = 'system', setTheme } = useTheme();
  return (
    <div className="flex flex-col gap-5">
      <Choice
        label={t('shell.theme')}
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: t('shell.themeLight'), icon: Sun },
          { value: 'dark', label: t('shell.themeDark'), icon: Moon },
          { value: 'system', label: t('shell.themeSystem'), icon: Monitor },
        ]}
      />
      <Choice<Locale>
        label={t('shell.language')}
        value={locale}
        onChange={setLocale}
        options={LOCALES.map((item) => ({ value: item, label: LOCALE_NAMES[item], lang: item }))}
      />
    </div>
  );
}

function Organizations() {
  const { t, tryT, formatDate } = useI18n();
  const { organization, organizations, switchTo } = useOrganization();
  return (
    <ul className="-mx-2 flex flex-col">
      {organizations.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
          <span
            aria-hidden
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent"
          >
            {item.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{item.name}</span>
              {item.id === organization.id && <Badge tone="accent">{t('settings.current')}</Badge>}
              {item.membership_status === 'SUSPENDED' && (
                <Badge tone="warning">{t('people.suspended')}</Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted">
              {tryT(`organization.roles.${item.role}`) ?? item.role} ·{' '}
              {t('settings.joinedOn', { date: formatDate(item.joined_at) })}
            </p>
          </div>
          {item.id !== organization.id && (
            <Button variant="secondary" size="sm" onClick={() => switchTo(item.id)}>
              {t('settings.switch')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Your profile, account security, preferences and organizations (spec §6: Settings). */
export function SettingsPage() {
  const { t, formatDate } = useI18n();
  const me = useMe();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      {me.isPending ? (
        <div className="flex flex-col gap-6" aria-busy>
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <>
          <Section
            id="settings-profile"
            title={t('settings.profile')}
            description={t('settings.profileDescription')}
          >
            {/* A save elsewhere changes updated_at, which resets the form to the saved values. */}
            <ProfileForm key={me.data.updated_at} me={me.data} />
          </Section>

          <Section id="settings-account" title={t('settings.account')}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">{t('settings.email')}</dt>
              <dd className="truncate">
                {isGuestEmail(me.data.email) ? t('settings.guestEmail') : me.data.email}
              </dd>
              <dt className="text-muted">{t('settings.memberSince')}</dt>
              <dd>{formatDate(me.data.created_at)}</dd>
              <dt className="text-muted">{t('settings.lastLogin')}</dt>
              <dd>
                {me.data.last_login_at
                  ? formatDate(me.data.last_login_at, { dateStyle: 'long', timeStyle: 'short' })
                  : t('settings.never')}
              </dd>
            </dl>
            {isGuestEmail(me.data.email) ? (
              // A guest has a random password nobody knows, so there is nothing to change.
              <p className="mt-6 border-t border-border pt-5 text-sm text-muted">
                {t('settings.guestPassword')}
              </p>
            ) : (
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="text-sm font-semibold">{t('settings.password')}</h3>
                <p className="mt-0.5 mb-4 text-sm text-muted">
                  {t('settings.passwordDescription')}
                </p>
                <PasswordForm email={me.data.email} />
              </div>
            )}
          </Section>

          <Section id="settings-preferences" title={t('settings.preferences')}>
            <Preferences />
          </Section>

          <Section
            id="settings-organizations"
            title={t('settings.organizations')}
            description={t('settings.organizationsDescription')}
          >
            <Organizations />
          </Section>
        </>
      )}
    </div>
  );
}
