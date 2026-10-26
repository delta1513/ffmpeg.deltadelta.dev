"use client";

import { ControlCard } from "@/components/ui/ControlCard";
import { TimeField } from "@/components/ui/Inputs";
import { TrimSlider } from "@/components/ui/TrimSlider";
import { formatClock } from "@/lib/format-display";
import type { Availability, Trim } from "@/lib/settings";
import styles from "./Drawer.module.css";

interface TrimControlProps {
  duration?: number;
  trim: Trim | null;
  onChange: (trim: Trim) => void;
  availability: Availability;
}

const GAP = 0.1;

export function TrimControl({ duration, trim, onChange, availability }: TrimControlProps) {
  const enabled = availability.enabled && Boolean(duration);
  const total = duration ?? 1;
  const start = trim ? Math.min(trim.start, total) : 0;
  const end = trim ? Math.min(trim.end, total) : total;
  const length = Math.max(0, end - start);
  const full = start < 0.05 && end > total - 0.05;

  const setStart = (v: number) => onChange({ start: Math.min(Math.max(0, v), end - GAP), end });
  const setEnd = (v: number) => onChange({ start, end: Math.max(Math.min(total, v), start + GAP) });

  return (
    <ControlCard
      label="Trim"
      labelId="ctl-trim"
      value={enabled ? (full ? "Whole clip" : `${formatClock(start)} – ${formatClock(end)}`) : undefined}
      description="Keep only the part you need. Drag the handles or type a time."
      enabled={enabled}
      reason={availability.reason}
      wide
    >
      <TrimSlider
        duration={total}
        start={start}
        end={end}
        disabled={!enabled}
        minGap={GAP}
        onChange={(s, e) => onChange({ start: s, end: e })}
      />
      <div className={styles.trimRow}>
        <TimeField label="Start" value={start} onCommit={setStart} disabled={!enabled} />
        <p className={styles.clipLength} aria-live="polite">
          Clip length: <strong className="tabular">{enabled ? formatClock(length) : "—"}</strong>
        </p>
        <TimeField label="End" value={end} onCommit={setEnd} disabled={!enabled} />
      </div>
    </ControlCard>
  );
}
