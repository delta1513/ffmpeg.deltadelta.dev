"use client";

import { AlertIcon } from "@/components/icons";
import { ControlCard } from "@/components/ui/ControlCard";
import { Switch } from "@/components/ui/Inputs";
import styles from "./Drawer.module.css";

interface EngineControlProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** The page is cross-origin isolated and has SharedArrayBuffer. */
  supported: boolean;
  /** Shown when the multi-thread core failed and the engine fell back. */
  notice: string | null;
}

export function EngineControl({ enabled, onChange, supported, notice }: EngineControlProps) {
  const on = enabled && supported;
  return (
    <ControlCard
      label="Multi-threaded engine"
      labelId="ctl-engine"
      enabled={supported}
      reason="Not supported in this browser"
      wide
    >
      <Switch label="Use the multi-threaded engine" checked={on} disabled={!supported} onChange={onChange} />
      {notice && on && (
        <p className={styles.engineNotice} role="status">
          <AlertIcon size={15} />
          {notice}
        </p>
      )}
    </ControlCard>
  );
}
