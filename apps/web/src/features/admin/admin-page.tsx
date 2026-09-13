'use client';

import { ShieldOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/translate';
import { cn } from '@/lib/cn';
import { can, canAdminister, type Permission } from '@/lib/permissions';
import { AuditPanel } from './audit-panel';
import { DepartmentsPanel } from './departments-panel';
import { InvitationsPanel } from './invitations-panel';
import { MembersPanel } from './members-panel';
import { OrganizationPanel } from './organization-panel';

type Tab = 'members' | 'invitations' | 'departments' | 'audit' | 'organization';

/** Tabs and the permission each needs (null: anyone who can open the admin area). */
const TABS: Array<{ id: Tab; label: MessageKey; permission: Permission | null }> = [
  { id: 'members', label: 'admin.tabMembers', permission: null },
  { id: 'invitations', label: 'admin.tabInvitations', permission: 'member.invite' },
  { id: 'departments', label: 'admin.tabDepartments', permission: null },
  { id: 'audit', label: 'admin.tabAudit', permission: 'audit.read' },
  { id: 'organization', label: 'admin.tabOrganization', permission: 'organization.update' },
];

/**
 * The admin area (spec §20 FE-04): each tab appears only for people allowed to use it, and the
 * API enforces every action again. `?tab=` selects a tab; `?invite=1` opens the invite dialog.
 */
export function AdminPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { organization } = useOrganization();

  if (!canAdminister(organization.role)) {
    return (
      <EmptyState
        className="py-24"
        icon={ShieldOff}
        title={t('admin.forbiddenTitle')}
        description={t('admin.forbiddenDescription')}
      />
    );
  }

  const tabs = TABS.filter((item) => !item.permission || can(organization.role, item.permission));
  const tab = tabs.find((item) => item.id === params.get('tab'))?.id ?? 'members';
  const select = (next: Tab) =>
    router.replace(next === 'members' ? '/admin' : `/admin?tab=${next}`);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title={t('admin.title')}
        description={t('admin.description', { organization: organization.name })}
      />
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => select(item.id)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === item.id
                ? 'border-accent text-fg'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'members' && <MembersPanel />}
        {tab === 'invitations' && <InvitationsPanel startOpen={params.get('invite') === '1'} />}
        {tab === 'departments' && <DepartmentsPanel />}
        {tab === 'audit' && <AuditPanel />}
        {tab === 'organization' && <OrganizationPanel />}
      </div>
    </div>
  );
}
