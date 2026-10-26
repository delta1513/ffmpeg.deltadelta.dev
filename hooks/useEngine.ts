"use client";

import { useSyncExternalStore } from "react";
import { Engine, getEngine, type EngineState } from "@/lib/engine";

/** Subscribe to the shared FFmpeg engine's load state. */
export function useEngine(): { engine: Engine; state: EngineState } {
  const engine = getEngine();
  const state = useSyncExternalStore(engine.subscribe, engine.getState, () => Engine.SERVER_STATE);
  return { engine, state };
}
