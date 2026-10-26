import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons";
import styles from "./ui.module.css";

interface ControlCardProps {
  label: string;
  labelId: string;
  value?: ReactNode;
  description?: string;
  enabled?: boolean;
  reason?: string;
  wide?: boolean;
  children: ReactNode;
}

/** One advanced setting: label, live value, optional hint, and a greyed-out state with a reason. */
export function ControlCard({ label, labelId, value, description, enabled = true, reason, wide, children }: ControlCardProps) {
  return (
    <fieldset className={styles.card} disabled={!enabled} data-wide={wide || undefined} aria-labelledby={labelId}>
      <div className={styles.cardHead}>
        <span id={labelId} className={styles.cardLabel}>
          {label}
        </span>
        {value !== undefined && enabled && <output className={styles.cardValue}>{value}</output>}
      </div>
      {!enabled && reason ? (
        <p className={styles.cardReason}>
          <InfoIcon size={15} />
          {reason}
        </p>
      ) : (
        description && <p className={styles.cardDesc}>{description}</p>
      )}
      <div className={styles.cardBody}>{children}</div>
    </fieldset>
  );
}
