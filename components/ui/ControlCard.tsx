import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons";
import styles from "./ui.module.css";

interface ControlCardProps {
  label: string;
  labelId: string;
  enabled?: boolean;
  reason?: string;
  wide?: boolean;
  children: ReactNode;
}

/** One advanced setting: label, and a greyed-out state with a reason. */
export function ControlCard({ label, labelId, enabled = true, reason, wide, children }: ControlCardProps) {
  return (
    <fieldset className={styles.card} disabled={!enabled} data-wide={wide || undefined} aria-labelledby={labelId}>
      <div className={styles.cardHead}>
        <span id={labelId} className={styles.cardLabel}>
          {label}
        </span>
      </div>
      {!enabled && reason && (
        <p className={styles.cardReason}>
          <InfoIcon size={15} />
          {reason}
        </p>
      )}
      <div className={styles.cardBody}>{children}</div>
    </fieldset>
  );
}
