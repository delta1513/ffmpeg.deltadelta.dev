/**
 * A tiny localStorage-backed store for useSyncExternalStore. localStorage is
 * only touched on the client (getSnapshot / set), never during prerender; the
 * server snapshot is the default value. Every access is wrapped in try/catch
 * because storage can be blocked or full.
 */
export interface PersistentStore<T> {
  get: () => T;
  getDefault: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPersistentStore<T>(
  key: string,
  defaultValue: T,
  sanitize: (raw: unknown) => T,
): PersistentStore<T> {
  let cache: { value: T } | null = null;
  const listeners = new Set<() => void>();

  const read = (): T => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? defaultValue : sanitize(JSON.parse(raw));
    } catch {
      return defaultValue;
    }
  };

  const get = () => {
    if (!cache) cache = { value: read() };
    return cache.value;
  };

  const notify = () => listeners.forEach((l) => l());

  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) {
      cache = null;
      notify();
    }
  };

  return {
    get,
    getDefault: () => defaultValue,
    set(next) {
      const value = typeof next === "function" ? (next as (p: T) => T)(get()) : next;
      cache = { value };
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage unavailable: keep the in-memory value for this visit.
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
  };
}
