import { useSyncExternalStore } from 'react';

/** A minimal external store for small client-only state (spec §11: a small UI state layer). */
export interface Store<T> {
  get(): T;
  set(update: (current: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const next = update(state);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Subscribes to part of a store. The selector must return the same reference for unchanged data. */
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  const read = () => selector(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}
