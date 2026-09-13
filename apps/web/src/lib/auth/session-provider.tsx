'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { currentAccessToken, onSessionChange, refreshAccessToken } from './session';

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out' | 'unavailable';

const SessionContext = createContext<{ status: SessionStatus; retry(): void } | null>(null);

/** Resolves the session once on load, then follows sign-in/out from any tab. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>(() =>
    currentAccessToken() ? 'signed-in' : 'loading',
  );

  const resolve = useCallback(() => {
    setStatus((current) => (current === 'signed-in' ? current : 'loading'));
    refreshAccessToken().then(
      (token) => setStatus(token ? 'signed-in' : 'signed-out'),
      () => setStatus('unavailable'),
    );
  }, []);

  useEffect(() => {
    if (!currentAccessToken()) resolve();
    return onSessionChange((signedIn) => {
      setStatus(signedIn ? 'signed-in' : 'signed-out');
      // Nothing tenant- or user-specific survives a sign-out (spec §17).
      if (!signedIn) queryClient.clear();
    });
  }, [queryClient, resolve]);

  return (
    <SessionContext.Provider value={{ status, retry: resolve }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
