'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/states';
import { ConnectionBanner } from '@/features/realtime/realtime-provider';
import { useI18n } from '@/i18n/provider';
import { CommandPalette } from './command-palette';
import { MobileNav } from './mobile-nav';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * Desktop: global navigation + workspace (spec §3). Pages add a context column only when they
 * need one. 768-1023px: the sidebar shrinks to icons. Below 768px: a top bar, one pane and a
 * bottom navigation.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <ConnectionBanner />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
        <MobileNav />
      </div>
      <CommandPalette />
    </div>
  );
}

/** Loading placeholder with the shell's shape, so nothing jumps when data arrives. */
export function ShellSkeleton() {
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background" aria-busy>
      <div className="hidden w-16 shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-4 md:flex lg:w-60">
        <Skeleton className="h-7 w-24" />
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Skeleton className="h-8 w-72" />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
