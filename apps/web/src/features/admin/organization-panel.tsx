'use client';

import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, TextField } from '@/components/ui/input';
import { useOrganization, type Membership } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { isHttpUrl } from '@/lib/url';
import { useUpdateOrganization } from './queries';

/** The IANA time zones this browser knows, always including the organization's own. */
function timeZones(current: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function OrganizationForm({ organization }: { organization: Membership }) {
  const i18n = useI18n();
  const { t } = i18n;
  const update = useUpdateOrganization();
  const zoneId = useId();
  const [name, setName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [logoUrl, setLogoUrl] = useState(organization.logo_url ?? '');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'logoUrl', string>>>({});

  const changes: { name?: string; timezone?: string; logo_url?: string | null } = {};
  if (name.trim() !== organization.name) changes.name = name.trim();
  if (timezone !== organization.timezone) changes.timezone = timezone;
  if ((logoUrl.trim() || null) !== organization.logo_url) changes.logo_url = logoUrl.trim() || null;
  const dirty = Object.keys(changes).length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!name.trim()) found.name = t('settings.required');
    if (logoUrl.trim() && !isHttpUrl(logoUrl.trim())) found.logoUrl = t('settings.invalidUrl');
    setErrors(found);
    if (!dirty || Object.keys(found).length > 0) return;
    update.mutate(changes, {
      onSuccess: () => toast.success(t('admin.organizationSaved')),
      onError: (error) => toast.error(describeError(error, i18n)),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-lg flex-col gap-4">
      <TextField
        label={t('admin.organizationName')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errors.name}
        maxLength={100}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={zoneId} className="text-[13px] font-medium text-fg">
          {t('admin.timezone')}
        </label>
        <Select id={zoneId} value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {timeZones(organization.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>
      <TextField
        type="url"
        label={t('admin.logoUrl')}
        value={logoUrl}
        onChange={(event) => setLogoUrl(event.target.value)}
        error={errors.logoUrl}
        hint={t('admin.logoHint')}
        placeholder="https://"
        maxLength={2048}
      />
      <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
        <dt className="text-muted">{t('admin.slug')}</dt>
        <dd className="font-mono text-xs leading-5">{organization.slug}</dd>
      </dl>
      <Button type="submit" className="self-start" disabled={!dirty} loading={update.isPending}>
        {t('admin.saveOrganization')}
      </Button>
    </form>
  );
}

/** Organization profile (organization.update). */
export function OrganizationPanel() {
  const { organization } = useOrganization();
  // A save changes updated_at, which resets the form to the saved values.
  return <OrganizationForm key={organization.updated_at} organization={organization} />;
}
