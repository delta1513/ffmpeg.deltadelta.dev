"use client";

import { useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { formatClock } from "@/lib/format-display";
import styles from "./ui.module.css";

type Thumb = "start" | "end";

interface TrimSliderProps {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  disabled?: boolean;
  /** Smallest allowed clip, seconds. */
  minGap?: number;
}

const STEP = 0.1;
const round = (v: number) => Math.round(v / STEP) * STEP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Two-knob range slider. Each knob is its own keyboard-operable role="slider". */
export function TrimSlider({ duration, start, end, onChange, disabled, minGap = STEP }: TrimSliderProps) {
  const uid = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<Thumb | null>(null);
  const gap = Math.min(minGap, duration);

  const commit = (thumb: Thumb, raw: number) => {
    if (thumb === "start") onChange(clamp(round(raw), 0, end - gap), end);
    else onChange(start, clamp(round(raw), start + gap, duration));
  };

  const valueAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pad = 12; // knob half-width: knobs stay inside the track
    return clamp((clientX - rect.left - pad) / Math.max(1, rect.width - 2 * pad), 0, 1) * duration;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const v = valueAt(e.clientX);
    const target = (e.target as HTMLElement).dataset.thumb as Thumb | undefined;
    const dStart = Math.abs(v - start);
    const dEnd = Math.abs(v - end);
    const thumb: Thumb = target ?? (dStart < dEnd || (dStart === dEnd && v < start) ? "start" : "end");
    dragging.current = thumb;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.getElementById(`${uid}-${thumb}`)?.focus({ preventScroll: true });
    if (!target) commit(thumb, v);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) commit(dragging.current, valueAt(e.clientX));
  };

  const endDrag = () => {
    dragging.current = null;
  };

  const onKeyDown = (thumb: Thumb) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const current = thumb === "start" ? start : end;
    const big = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = current - STEP * big;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = current + STEP * big;
        break;
      case "PageDown":
        next = current - 5;
        break;
      case "PageUp":
        next = current + 5;
        break;
      case "Home":
        next = thumb === "start" ? 0 : start + gap;
        break;
      case "End":
        next = thumb === "start" ? end - gap : duration;
        break;
    }
    if (next !== null) {
      e.preventDefault();
      commit(thumb, next);
    }
  };

  const p = (v: number) => (duration > 0 ? v / duration : 0);
  const style = { "--a": p(start), "--b": p(end) } as CSSProperties;

  const knob = (thumb: Thumb, value: number, min: number, max: number, label: string) => (
    <div
      id={`${uid}-${thumb}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={Number(min.toFixed(1))}
      aria-valuemax={Number(max.toFixed(1))}
      aria-valuenow={Number(value.toFixed(1))}
      aria-valuetext={formatClock(value)}
      aria-disabled={disabled || undefined}
      data-thumb={thumb}
      className={styles.trimKnob}
      style={{ "--p": p(value) } as CSSProperties}
      onKeyDown={onKeyDown(thumb)}
    />
  );

  return (
    <div
      ref={trackRef}
      className={styles.trim}
      data-disabled={disabled || undefined}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={styles.trimTrack} aria-hidden="true">
        <div className={styles.trimFill} />
      </div>
      {knob("start", start, 0, end - gap, "Start time")}
      {knob("end", end, start + gap, duration, "End time")}
    </div>
  );
}
