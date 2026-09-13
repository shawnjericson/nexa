'use client';

import { unwrap } from '@nexa/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useI18n } from '@/i18n/provider';
import { api, setActiveOrganizationId } from '@/lib/api/client';
import { canAdminister } from '@/lib/permissions';

const STORAGE_KEY = 'nexa.activeOrganizationId';

type Organizations = Awaited<ReturnType<typeof fetchOrganizations>>;
export type Membership = Organizations[number];

function fetchOrganizations() {
  return unwrap(api.GET('/api/v1/organizations'));
}

interface OrganizationContextValue {
  organization: Membership;
  organizations: Organizations;
  switchTo(id: string): void;
  /** Management UI hints only; the API enforces every permission. */
  isManager: boolean;
  /** Whether the admin area has something for this person (members, invitations, audit…). */
  canAdminister: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The active organization. Every request carries it (X-Organization-Id), and every tenant query
 * key starts with ['org', id], so switching can never show one company's data in another (§17).
 */
export function OrganizationProvider({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['organizations'], queryFn: fetchOrganizations });
  const [activeId, setActiveId] = useState<string | null>(readStoredId);

  const organizations = query.data;
  const organization =
    organizations?.find((item) => item.id === activeId) ?? organizations?.[0] ?? null;
  // Set before children render, so their first requests already carry the right organization.
  setActiveOrganizationId(organization?.id ?? null);

  const switchTo = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Private browsing: the choice just doesn't persist.
      }
      setActiveOrganizationId(id);
      queryClient.removeQueries({ predicate: (cached) => cached.queryKey[0] === 'org' });
      setActiveId(id);
    },
    [queryClient],
  );

  const value = useMemo(
    () =>
      organization && organizations
        ? {
            organization,
            organizations,
            switchTo,
            isManager: organization.role === 'OWNER' || organization.role === 'ADMIN',
            canAdminister: canAdminister(organization.role),
          }
        : null,
    [organization, organizations, switchTo],
  );

  if (query.isPending) return fallback;
  if (query.isError) {
    return (
      <ErrorState
        className="min-h-dvh justify-center"
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (!value) {
    return (
      <EmptyState
        className="min-h-dvh justify-center"
        icon={Building2}
        title={t('organization.noneTitle')}
        description={t('organization.noneDescription')}
      />
    );
  }
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error('useOrganization must be used inside <OrganizationProvider>');
  return context;
}

/** Query keys scoped to the active organization. */
export function useOrgKey() {
  const { organization } = useOrganization();
  return useCallback(
    (...parts: unknown[]) => ['org', organization.id, ...parts] as const,
    [organization.id],
  );
}
