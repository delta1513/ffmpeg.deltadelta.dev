"use client";

import { useSyncExternalStore } from "react";
import type { PersistentStore } from "@/lib/persistent-store";

/** Read and write a persistent store. Renders the default on the server and during hydration. */
export function usePersistentState<T>(store: PersistentStore<T>): [T, PersistentStore<T>["set"]] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.getDefault);
  return [value, store.set];
}
