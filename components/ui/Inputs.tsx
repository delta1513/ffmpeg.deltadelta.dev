"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { formatClock, parseClock } from "@/lib/format-display";
import styles from "./ui.module.css";

// Segmented control ------------------------------------------------------------

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  sub?: string;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  name: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  "aria-labelledby"?: string;
  disabled?: boolean;
}

/** A row of mutually exclusive choices built on native radios (arrow keys for free). */
export function Segmented<T extends string | number>({
  name,
  value,
  options,
  onChange,
  disabled,
  ...aria
}: SegmentedProps<T>) {
  const stacked = options.some((o) => o.sub);
  return (
    <div
      role="radiogroup"
      aria-labelledby={aria["aria-labelledby"]}
      className={styles.segmented}
      data-stacked={stacked || undefined}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        const off = disabled || o.disabled;
        return (
          <label
            key={String(o.value)}
            className={styles.segment}
            data-checked={checked || undefined}
            data-disabled={off || undefined}
            title={o.title}
          >
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={String(o.value)}
              checked={checked}
              disabled={off}
              onChange={() => onChange(o.value)}
            />
            <span className={styles.segmentLabel}>{o.label}</span>
            {o.sub && <span className={styles.segmentSub}>{o.sub}</span>}
          </label>
        );
      })}
    </div>
  );
}

// Select ---------------------------------------------------------------------------

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function Select({ children, className, ...rest }: SelectProps) {
  return (
    <div className={`${styles.select} ${className ?? ""}`} data-disabled={rest.disabled || undefined}>
      <select {...rest}>{children}</select>
      <ChevronDownIcon size={16} />
    </div>
  );
}

// Switch ---------------------------------------------------------------------------

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className={styles.switch} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        role="switch"
        className="visually-hidden"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span>{label}</span>
    </label>
  );
}

// Draft-while-typing text field ---------------------------------------------------

interface DraftFieldProps {
  label: string;
  /** Formatted value shown when not editing. */
  display: string;
  /** Parse the typed text; return null when invalid. */
  parse: (text: string) => number | null;
  onCommit: (value: number) => void;
  disabled?: boolean;
  inputMode?: "decimal" | "numeric";
  suffix?: string;
  width?: string;
}

/** A text field that lets people type freely and commits on Enter / blur. */
export function DraftField({ label, display, parse, onCommit, disabled, inputMode = "decimal", suffix, width }: DraftFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parse(draft) === null;

  const commit = () => {
    if (draft !== null) {
      const v = parse(draft);
      if (v !== null) onCommit(v);
    }
    setDraft(null);
  };

  return (
    <label className={styles.field} style={width ? { width } : undefined} data-invalid={invalid || undefined}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldBox}>
        <input
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          value={draft ?? display}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onFocus={(e) => {
            setDraft(display);
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
        {suffix && <span className={styles.fieldSuffix}>{suffix}</span>}
      </span>
    </label>
  );
}

/** m:ss.s time field. */
export function TimeField(props: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <DraftField
      label={props.label}
      display={formatClock(props.value)}
      parse={parseClock}
      onCommit={props.onCommit}
      disabled={props.disabled}
      width="7.5rem"
    />
  );
}
