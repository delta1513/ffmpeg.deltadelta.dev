"use client";

import { ControlCard } from "@/components/ui/ControlCard";
import { DraftField, Select, Switch } from "@/components/ui/Inputs";
import {
  MAX_DIMENSION,
  orientedSourceSize,
  resolveCustomSize,
  SIZE_PRESETS,
  sizeFor,
  sizePresetsFor,
  type SizePreset,
  type SizeSetting,
} from "@/lib/settings";
import type { ControlProps } from "./types";
import styles from "./Drawer.module.css";

const parseDimension = (text: string) => {
  const n = Number(text.trim().replace(/px$/i, ""));
  return Number.isFinite(n) && n >= 2 && n <= MAX_DIMENSION ? Math.round(n) : null;
};

export function DimensionsControl({ settings, update, format, meta, availability }: ControlProps) {
  const isGif = format.video === "gif";
  const size = sizeFor(settings, format);
  const src = orientedSourceSize(meta, settings.rotate);
  const evenOnly = !isGif;
  const resolved = resolveCustomSize(size, meta, settings.rotate, evenOnly);
  const enabled = availability.dimensions.enabled;

  const set = (patch: Partial<SizeSetting>) => {
    const next = { ...size, ...patch };
    update(isGif ? { gifSize: next } : { size: next });
  };

  const presets = sizePresetsFor(meta);
  const options = presets.some((p) => p.id === size.preset)
    ? presets
    : [...presets.slice(0, -1), SIZE_PRESETS.find((p) => p.id === size.preset)!, presets[presets.length - 1]];

  const presetOutput = (short: number) => {
    if (!src) return null;
    const k = short / Math.min(src.w, src.h);
    const even = (n: number) => Math.round(n / 2) * 2;
    return `${even(src.w * k)}×${even(src.h * k)}`;
  };

  let value: string;
  if (size.preset === "original") value = src ? `Original · ${src.w}×${src.h}` : "Original";
  else if (size.preset === "custom") value = `${resolved.width}×${resolved.height || "auto"}`;
  else {
    const short = SIZE_PRESETS.find((p) => p.id === size.preset)?.short ?? 0;
    value = presetOutput(short) ?? `${short}p`;
  }

  return (
    <ControlCard
      label="Dimensions"
      labelId="ctl-size"
      value={value}
      description={isGif ? "GIFs look best small — 480 px wide is a good start." : "Smaller dimensions make a much smaller file."}
      enabled={enabled}
      reason={availability.dimensions.reason}
    >
      <Select
        aria-labelledby="ctl-size"
        value={size.preset}
        disabled={!enabled}
        onChange={(e) => {
          const preset = e.target.value as SizePreset;
          // Seed the custom size from the source so the fields start somewhere sensible.
          if (preset === "custom" && size.preset !== "custom" && src) set({ preset, width: src.w, height: src.h });
          else set({ preset });
        }}
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>

      {size.preset === "custom" && (
        <div className={styles.customSize}>
          <div className={styles.customFields}>
            <DraftField
              label="Width"
              display={String(resolved.width)}
              parse={parseDimension}
              onCommit={(w) => set({ width: w })}
              disabled={!enabled}
              inputMode="numeric"
              suffix="px"
            />
            <span className={styles.times} aria-hidden="true">
              ×
            </span>
            <DraftField
              label="Height"
              display={resolved.height ? String(resolved.height) : "auto"}
              parse={parseDimension}
              onCommit={(h) =>
                size.lockAspect && src ? set({ width: Math.round(h * (src.w / src.h)), height: h }) : set({ height: h })
              }
              disabled={!enabled || (size.lockAspect && !src)}
              inputMode="numeric"
              suffix="px"
            />
          </div>
          <Switch
            label="Lock aspect ratio"
            checked={size.lockAspect}
            disabled={!enabled}
            onChange={(lockAspect) => set({ lockAspect, height: resolved.height || size.height })}
          />
          {evenOnly && <p className={styles.note}>Sizes are rounded to even numbers for best compatibility.</p>}
        </div>
      )}
    </ControlCard>
  );
}
