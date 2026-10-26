"use client";

import { ChevronDownIcon, SlidersIcon } from "@/components/icons";
import type { FormatDef } from "@/lib/formats";
import type { ControlAvailability, Settings, SourceMeta, Trim } from "@/lib/settings";
import { CommandBlock } from "./CommandBlock";
import {
  AudioControl,
  FrameRateControl,
  PixelFormatControl,
  QualityControl,
  RotateControl,
  SpeedControl,
} from "./Controls";
import { DimensionsControl } from "./DimensionsControl";
import { TrimControl } from "./TrimControl";
import styles from "./Drawer.module.css";

interface AdvancedDrawerProps {
  open: boolean;
  onToggle: () => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onReset: () => void;
  changedCount: number;
  format: FormatDef;
  meta: SourceMeta;
  availability: ControlAvailability;
  trim: Trim | null;
  onTrimChange: (trim: Trim) => void;
  commandArgs: readonly string[];
  inputName: string;
  outputName: string;
  /** Lock the controls (while converting). */
  locked: boolean;
}

export function AdvancedDrawer(props: AdvancedDrawerProps) {
  const { open, onToggle, changedCount, format, locked } = props;
  const control = {
    settings: props.settings,
    update: props.update,
    format,
    meta: props.meta,
    availability: props.availability,
  };

  return (
    <section className={styles.drawer} data-open={open || undefined} aria-label="Advanced settings">
      <button
        type="button"
        className={styles.bar}
        aria-expanded={open}
        aria-controls="advanced-panel"
        onClick={onToggle}
      >
        <span className={styles.barIcon} aria-hidden="true">
          <SlidersIcon size={18} />
        </span>
        <span className={styles.barTitle}>Advanced settings</span>
        {changedCount > 0 && <span className={styles.badge}>{changedCount} changed</span>}
        <span className={styles.barHint}>{open ? "Hide" : "Quality, size, trim & more"}</span>
        <ChevronDownIcon size={20} className={styles.chevron} />
      </button>

      <div id="advanced-panel" className={styles.reveal} inert={!open}>
        <div className={styles.revealInner}>
          <div className={styles.content} inert={locked}>
            <div className={styles.toolbar}>
              <p>
                Settings for <strong>{format.label}</strong>. They’re saved on this device.
              </p>
              <button type="button" className="link-btn" onClick={props.onReset}>
                Reset to defaults
              </button>
            </div>

            <div className={styles.grid}>
              <QualityControl {...control} />
              <FrameRateControl {...control} />
              <TrimControl
                duration={props.meta.duration}
                trim={props.trim}
                onChange={props.onTrimChange}
                availability={props.availability.trim}
              />
              <DimensionsControl {...control} />
              <PixelFormatControl {...control} />
              <AudioControl {...control} />
              <SpeedControl {...control} />
              <RotateControl {...control} />
            </div>

            <CommandBlock args={props.commandArgs} inputName={props.inputName} outputName={props.outputName} />
          </div>
        </div>
      </div>
    </section>
  );
}
