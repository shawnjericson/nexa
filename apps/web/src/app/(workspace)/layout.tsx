'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell, ShellSkeleton } from '@/components/shell/app-shell';
import { ErrorState } from '@/components/ui/states';
import { OrganizationProvider } from '@/features/organization/organization-provider';
import { RealtimeProvider } from '@/features/realtime/realtime-provider';
import { useI18n } from '@/i18n/provider';
import { SessionProvider, useSession } from '@/lib/auth/session-provider';

function RequireSession({ children }: { children: ReactNode }) {
  const { status, error, retry } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'signed-out') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === 'unavailable') {
    return (
      <ErrorState
        className="min-h-dvh justify-center"
        title={t('auth.unavailableTitle')}
        // Says why: the network, or too many requests (the session retries by itself).
        error={error ?? new TypeError('offline')}
        onRetry={retry}
      />
    );
  }
  if (status !== 'signed-in') return <ShellSkeleton />;
  return <>{children}</>;
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <RequireSession>
        <OrganizationProvider fallback={<ShellSkeleton />}>
          <RealtimeProvider>
            <AppShell>{children}</AppShell>
          </RealtimeProvider>
        </OrganizationProvider>
      </RequireSession>
    </SessionProvider>
  );
}
