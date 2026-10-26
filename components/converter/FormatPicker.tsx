"use client";

import { CheckIcon } from "@/components/icons";
import { FORMATS, type FormatDef, type FormatId } from "@/lib/formats";
import type { SourceMeta } from "@/lib/settings";
import styles from "./FormatPicker.module.css";

const GROUPS = [
  { id: "video", label: "Video", formats: FORMATS.filter((f) => f.group === "video") },
  { id: "audio", label: "Audio only", formats: FORMATS.filter((f) => f.group === "audio") },
] as const;

/** Why a format can't be used for this file, if it can't. */
export function formatUnavailableReason(format: FormatDef, meta: SourceMeta): string | undefined {
  if (format.group === "video" && meta.hasVideo === false) return "Your file has no picture";
  if (format.group === "audio" && meta.hasAudio === false) return "Your file has no sound";
  return undefined;
}

/** The selected format, or the first usable one if the file rules it out. */
export function resolveFormat(id: FormatId, meta: SourceMeta): FormatDef {
  const chosen = FORMATS.find((f) => f.id === id) ?? FORMATS[0];
  if (!formatUnavailableReason(chosen, meta)) return chosen;
  return FORMATS.find((f) => !formatUnavailableReason(f, meta)) ?? chosen;
}

interface FormatPickerProps {
  value: FormatId;
  meta: SourceMeta;
  onChange: (id: FormatId) => void;
}

export function FormatPicker({ value, meta, onChange }: FormatPickerProps) {
  return (
    <fieldset className={styles.picker}>
      <legend className={styles.title}>Convert to</legend>
      {GROUPS.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`fmt-group-${group.id}`} className={styles.group}>
          <p id={`fmt-group-${group.id}`} className={styles.groupLabel}>
            {group.label}
          </p>
          <div className={styles.tiles}>
            {group.formats.map((f) => {
              const reason = formatUnavailableReason(f, meta);
              const checked = f.id === value;
              return (
                <label
                  key={f.id}
                  className={styles.tile}
                  data-checked={checked || undefined}
                  data-disabled={reason ? true : undefined}
                  title={reason}
                >
                  <input
                    type="radio"
                    name="output-format"
                    value={f.id}
                    className="visually-hidden"
                    checked={checked}
                    disabled={Boolean(reason)}
                    onChange={() => onChange(f.id)}
                  />
                  <span className={styles.name}>{f.label}</span>
                  <span className={styles.hint}>{reason ?? f.hint}</span>
                  <span className={styles.check} aria-hidden="true">
                    <CheckIcon size={13} strokeWidth={3} />
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
