'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { currentAccessToken, onSessionChange, refreshAccessToken } from './session';

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out' | 'unavailable';

interface SessionContextValue {
  status: SessionStatus;
  /** Why the session couldn't be resolved, while status is 'unavailable'. */
  error: unknown;
  retry(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** While the session can't be resolved, it is tried again after 5s, 10s, 20s… up to a minute. */
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** Resolves the session once on load, then follows sign-in/out from any tab. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>(() =>
    currentAccessToken() ? 'signed-in' : 'loading',
  );
  const [error, setError] = useState<unknown>(null);
  const failures = useRef(0);

  const resolve = useCallback(() => {
    // A retry keeps the error on screen until it has an answer, instead of flashing a skeleton.
    setStatus((current) =>
      current === 'signed-in' || current === 'unavailable' ? current : 'loading',
    );
    refreshAccessToken().then(
      (token) => {
        failures.current = 0;
        setError(null);
        setStatus(token ? 'signed-in' : 'signed-out');
      },
      (reason: unknown) => {
        failures.current += 1;
        setError(reason);
        setStatus('unavailable');
      },
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

  // Offline or rate limited: try again by itself, and at once when the network comes back.
  useEffect(() => {
    if (status !== 'unavailable') return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures.current - 1), RETRY_MAX_MS);
    const timer = setTimeout(resolve, delay);
    window.addEventListener('online', resolve);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', resolve);
    };
  }, [status, error, resolve]);

  return (
    <SessionContext.Provider value={{ status, error, retry: resolve }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
