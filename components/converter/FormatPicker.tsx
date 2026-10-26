"use client";

import { Select } from "@/components/ui/Inputs";
import { FORMATS, type FormatDef, type FormatId } from "@/lib/formats";
import type { SourceMeta } from "@/lib/settings";
import styles from "./Converter.module.css";

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
    <div>
      <label htmlFor="output-format" className={styles.title}>
        Convert to
      </label>
      <Select id="output-format" value={value} onChange={(e) => onChange(e.target.value as FormatId)}>
        {GROUPS.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {group.formats.map((f) => {
              const reason = formatUnavailableReason(f, meta);
              return (
                <option key={f.id} value={f.id} disabled={Boolean(reason)} title={reason}>
                  {f.label}
                </option>
              );
            })}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}
