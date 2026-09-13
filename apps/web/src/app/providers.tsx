'use client';

import { isApiError } from '@nexa/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { Tooltip } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import type { Locale } from '@/i18n/config';
import { I18nProvider } from '@/i18n/provider';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (403, 404...) won't fix themselves; network and server errors might.
        retry: (failures, error) => !(isApiError(error) && error.status < 500) && failures < 2,
      },
    },
  });
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      toastOptions={{ className: 'text-sm' }}
    />
  );
}

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider locale={locale}>
        <QueryClientProvider client={queryClient}>
          <Tooltip.Provider delayDuration={400}>
            {children}
            <ThemedToaster />
          </Tooltip.Provider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
