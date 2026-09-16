import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches right now, for the few places where layout and behaviour
 * differ (a side panel on a wide screen, a full-screen sheet on a phone - spec §13). Anything
 * that is only visual stays in CSS.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    // On the server nothing matches; the workspace renders on the client anyway (ADR-019).
    () => false,
  );
}
