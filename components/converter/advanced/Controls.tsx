"use client";

import { ControlCard } from "@/components/ui/ControlCard";
import { Segmented, Select, type SegmentOption } from "@/components/ui/Inputs";
import { Slider } from "@/components/ui/Slider";
import uiStyles from "@/components/ui/ui.module.css";
import { gifColors, vp8Crf, x264Crf } from "@/lib/ffmpeg-args";
import {
  AUDIO_BITRATES,
  bitrateFor,
  effectiveAudioMode,
  effectivePixFmt,
  FPS_MAX,
  FPS_MIN,
  FPS_TICKS,
  fpsFor,
  GIF_FPS_MAX,
  maxAudioBitrate,
  type AudioMode,
  type EncodingSpeed,
  type PixelFormat,
  type Rotation,
} from "@/lib/settings";
import type { ControlProps } from "./types";
import styles from "./Drawer.module.css";

// Quality ------------------------------------------------------------------------

export function QualityControl({ settings, update, format, availability }: ControlProps) {
  const q = settings.quality;
  const tech =
    format.video === "libx264"
      ? `CRF ${x264Crf(q)}`
      : format.video === "libvpx"
        ? `CRF ${vp8Crf(q)}`
        : format.video === "gif"
          ? `${gifColors(q)} colours`
          : null;
  return (
    <ControlCard
      label="Quality"
      labelId="ctl-quality"
      enabled={availability.quality.enabled}
      reason={availability.quality.reason}
    >
      <Slider
        aria-labelledby="ctl-quality"
        min={0}
        max={100}
        value={q}
        onChange={(v) => update({ quality: v })}
        valueText={tech ? `${q} (${tech})` : String(q)}
        startLabel="Smaller file"
        endLabel="Best quality"
        disabled={!availability.quality.enabled}
      />
    </ControlCard>
  );
}

// Frame rate ----------------------------------------------------------------------

const ORIGINAL_STOP = FPS_MIN - 1;

export function FrameRateControl({ settings, update, format, availability }: ControlProps) {
  const isGif = format.video === "gif";
  const max = isGif ? GIF_FPS_MAX : FPS_MAX;
  const fps = fpsFor(settings, format);
  const value = fps ?? ORIGINAL_STOP;
  const set = (v: number | null) => update(isGif ? { gifFps: v } : { fps: v });
  const presets: (number | null)[] = [null, ...(isGif ? [10] : []), ...FPS_TICKS.filter((t) => t <= max)];
  const label = (v: number | null) => (v === null ? "Original" : `${v} fps`);
  const disabled = !availability.frameRate.enabled;

  return (
    <ControlCard
      label="Frame rate"
      labelId="ctl-fps"
      enabled={!disabled}
      reason={availability.frameRate.reason}
    >
      <Slider
        aria-labelledby="ctl-fps"
        min={ORIGINAL_STOP}
        max={max}
        value={Math.min(value, max)}
        onChange={(v) => set(v <= ORIGINAL_STOP ? null : v)}
        valueText={label(fps)}
        ticks={FPS_TICKS.filter((t) => t <= max)}
        disabled={disabled}
      />
      <div className={uiStyles.chips} role="group" aria-label="Common frame rates">
        {presets.map((p) => (
          <button
            key={String(p)}
            type="button"
            className={uiStyles.chip}
            aria-pressed={p === fps}
            disabled={disabled}
            onClick={() => set(p)}
          >
            {p === null ? "Original" : p}
          </button>
        ))}
      </div>
    </ControlCard>
  );
}

// Colour model ---------------------------------------------------------------------

export function PixelFormatControl({ settings, update, format, availability }: ControlProps) {
  const high = availability.pixFmtHigh;
  const options: SegmentOption<PixelFormat>[] = [
    { value: "yuv420p", label: "4:2:0" },
    { value: "yuv422p", label: "4:2:2", disabled: !high.enabled, title: high.reason },
    { value: "yuv444p", label: "4:4:4", disabled: !high.enabled, title: high.reason },
  ];
  const value = effectivePixFmt(settings.pixFmt, format);
  return (
    <ControlCard
      label="Colour model"
      labelId="ctl-pixfmt"
      enabled={availability.pixFmt.enabled}
      reason={availability.pixFmt.reason}
    >
      <Segmented
        name="pixfmt"
        aria-labelledby="ctl-pixfmt"
        value={value}
        options={options}
        onChange={(v) => update({ pixFmt: v })}
        disabled={!availability.pixFmt.enabled}
      />
    </ControlCard>
  );
}

// Audio --------------------------------------------------------------------------

export function AudioControl({ settings, update, format, availability }: ControlProps) {
  const mode = effectiveAudioMode(settings.audio, format);
  const bitrate = bitrateFor(settings, format);
  const maxBitrate = maxAudioBitrate(format, mode);
  const audioOnly = format.video === null;
  const options: SegmentOption<AudioMode>[] = [
    { value: "stereo", label: "Stereo" },
    { value: "mono", label: "Mono" },
    {
      value: "none",
      label: "No audio",
      disabled: !availability.audioNone.enabled,
      title: availability.audioNone.reason,
    },
  ];

  return (
    <ControlCard
      label="Audio"
      labelId="ctl-audio"
      enabled={availability.audio.enabled}
      reason={availability.audio.reason}
      wide
    >
      <div className={styles.audioRow}>
        <div className={styles.subControl}>
          <span id="ctl-audio-ch" className={styles.subLabel}>
            Channels
          </span>
          <Segmented
            name="audio-mode"
            aria-labelledby="ctl-audio-ch"
            value={mode}
            options={options}
            onChange={(v) => update({ audio: v })}
            disabled={!availability.audio.enabled}
          />
        </div>
        <div className={styles.subControl}>
          <label htmlFor="ctl-bitrate" className={styles.subLabel}>
            Bitrate
            {!availability.audioBitrate.enabled && availability.audio.enabled && (
              <span className={styles.subReason}> — {availability.audioBitrate.reason}</span>
            )}
          </label>
          <Select
            id="ctl-bitrate"
            value={bitrate}
            disabled={!availability.audioBitrate.enabled}
            onChange={(e) => {
              const v = Number(e.target.value);
              update(audioOnly ? { audioOnlyBitrate: v } : { audioBitrate: v });
            }}
          >
            {AUDIO_BITRATES.map((b) => (
              <option key={b} value={b} disabled={b > maxBitrate}>
                {b} kbps
                {b === (audioOnly ? 192 : 128) ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </ControlCard>
  );
}

// Encoding speed -------------------------------------------------------------------

const SPEED_LABEL: Record<EncodingSpeed, string> = {
  fastest: "Fastest",
  fast: "Fast",
  balanced: "Balanced",
  smallest: "Smallest file",
};

export function SpeedControl({ settings, update, availability }: ControlProps) {
  return (
    <ControlCard
      label="Encoding speed"
      labelId="ctl-speed"
      enabled={availability.speed.enabled}
      reason={availability.speed.reason}
    >
      <Segmented
        name="speed"
        aria-labelledby="ctl-speed"
        value={settings.speed}
        options={(Object.keys(SPEED_LABEL) as EncodingSpeed[]).map((v) => ({ value: v, label: SPEED_LABEL[v] }))}
        onChange={(v) => update({ speed: v })}
        disabled={!availability.speed.enabled}
      />
    </ControlCard>
  );
}

// Rotate ------------------------------------------------------------------------

const ROTATIONS: { value: Rotation; label: string }[] = [
  { value: 0, label: "None" },
  { value: 90, label: "90° right" },
  { value: 180, label: "180°" },
  { value: 270, label: "90° left" },
];

export function RotateControl({ settings, update, availability }: ControlProps) {
  return (
    <ControlCard
      label="Rotate"
      labelId="ctl-rotate"
      enabled={availability.rotate.enabled}
      reason={availability.rotate.reason}
    >
      <Segmented
        name="rotate"
        aria-labelledby="ctl-rotate"
        value={settings.rotate}
        options={ROTATIONS.map((r) => ({
          value: r.value,
          label: (
            <>
              <span className={styles.rotateGlyph} data-rotate={r.value} aria-hidden="true" />
              {r.label}
            </>
          ),
        }))}
        onChange={(v) => update({ rotate: v })}
        disabled={!availability.rotate.enabled}
      />
    </ControlCard>
  );
}
