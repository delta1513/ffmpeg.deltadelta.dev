"use client";

import type { CSSProperties } from "react";
import styles from "./ui.module.css";

interface SliderProps {
  id?: string;
  "aria-labelledby"?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  valueText?: string;
  /** Values to mark under the track. */
  ticks?: readonly number[];
  startLabel?: string;
  endLabel?: string;
  disabled?: boolean;
}

const ratio = (v: number, min: number, max: number) => (max === min ? 0 : (v - min) / (max - min));

/** Native range input with a filled track, optional tick labels and end labels. */
export function Slider({
  id,
  min,
  max,
  step = 1,
  value,
  onChange,
  valueText,
  ticks,
  startLabel,
  endLabel,
  disabled,
  ...aria
}: SliderProps) {
  const style = { "--p": ratio(value, min, max) } as CSSProperties;
  return (
    <div className={styles.slider} data-disabled={disabled || undefined}>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        aria-labelledby={aria["aria-labelledby"]}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ticks && ticks.length > 0 && (
        <div className={styles.ticks} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className={styles.tick}
              data-active={t === value || undefined}
              style={{ "--p": ratio(t, min, max) } as CSSProperties}
            />
          ))}
        </div>
      )}
      {(startLabel || endLabel) && (
        <div className={styles.ends}>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      )}
    </div>
  );
}
