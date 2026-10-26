"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AlertIcon, XIcon } from "@/components/icons";
import type { EngineState } from "@/lib/engine";
import { formatClock } from "@/lib/format-display";
import styles from "./Stage.module.css";

export interface RunningJob {
  phase: "engine" | "converting";
  progress: number;
  startedAt: number;
  formatLabel: string;
  /** The multi-thread engine has gone quiet for a while. */
  stalled: boolean;
}

interface ProgressProps {
  job: RunningJob;
  engine: EngineState;
  onCancel: () => void;
}

const MB = 1024 * 1024;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Film-strip progress bar with percent, elapsed / remaining time and a cancel button. */
export function Progress({ job, engine, onCancel }: ProgressProps) {
  const now = useNow(500);
  const loadingEngine = job.phase === "engine";
  const downloading = loadingEngine && engine.phase !== "initializing" && engine.phase !== "ready";

  let ratio: number | null;
  let title: string;
  let detail: string;
  if (downloading) {
    ratio = engine.total ? engine.received / engine.total : 0;
    title = "Loading the converter engine (one-time ~31 MB download)…";
    detail = `${(engine.received / MB).toFixed(1)} of ${(engine.total / MB).toFixed(1)} MB`;
  } else if (loadingEngine) {
    ratio = null;
    title = "Starting the converter engine…";
    detail = "Almost there";
  } else {
    ratio = job.progress;
    title = `Converting to ${job.formatLabel}…`;
    const elapsed = Math.max(0, (now - job.startedAt) / 1000);
    const remaining = job.progress > 0.02 && elapsed > 1.5 ? (elapsed / job.progress) * (1 - job.progress) : null;
    detail = `Elapsed ${formatClock(elapsed, false)}${remaining !== null ? `  ·  About ${formatClock(remaining, false)} left` : "  ·  Estimating time left…"}`;
  }

  const percent = ratio === null ? null : Math.min(100, Math.floor(ratio * 100));

  return (
    <div className={styles.progress}>
      <div className={styles.progressHead}>
        <div className={styles.progressText}>
          <p className={styles.progressTitle}>{title}</p>
          <p className={`${styles.progressDetail} tabular`}>{detail}</p>
        </div>
        <span className={`${styles.percent} tabular`} aria-hidden="true">
          {percent === null ? "" : `${percent}%`}
        </span>
      </div>

      <div
        className={styles.filmbar}
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? "Starting" : `${percent}%`}
        data-indeterminate={percent === null || undefined}
        style={{ "--p": ratio ?? 0 } as CSSProperties}
      >
        <span className={styles.filmbarFill} />
      </div>

      {job.stalled && (
        <p className={styles.stall} role="alert">
          <AlertIcon size={16} />
          Conversion seems stuck — try turning off the multi-threaded engine.
        </p>
      )}

      <div className={styles.progressFoot}>
        <p className={styles.progressNote}>Keep this tab open — everything happens on your device.</p>
        <button type="button" className="btn" onClick={onCancel}>
          <XIcon size={16} />
          Cancel
        </button>
      </div>
    </div>
  );
}
