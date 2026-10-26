/**
 * The user-adjustable conversion settings, their defaults, validation of
 * persisted values, and which controls apply to which format.
 */
import type { FormatDef } from "./formats";

export type SizePreset = "original" | "2160" | "1440" | "1080" | "720" | "480" | "360" | "custom";
export type PixelFormat = "yuv420p" | "yuv422p" | "yuv444p";
export type AudioMode = "stereo" | "mono" | "none";
export type EncodingSpeed = "fastest" | "fast" | "balanced" | "smallest";
export type Rotation = 0 | 90 | 180 | 270;

export interface SizeSetting {
  preset: SizePreset;
  /** Custom size. With lockAspect on, width drives and height follows the source. */
  width: number;
  height: number;
  lockAspect: boolean;
}

export interface Settings {
  /** 0 (smallest file) to 100 (best quality). */
  quality: number;
  /** Output frame rate for video formats; null keeps the original. */
  fps: number | null;
  /** Frame rate for GIF output; null keeps the original. */
  gifFps: number | null;
  size: SizeSetting;
  gifSize: SizeSetting;
  pixFmt: PixelFormat;
  audio: AudioMode;
  /** kbps, used by video formats. */
  audioBitrate: number;
  /** kbps, used by MP3 / M4A. */
  audioOnlyBitrate: number;
  speed: EncodingSpeed;
  rotate: Rotation;
}

/** Trim range in seconds. Not persisted: it belongs to one file. */
export interface Trim {
  start: number;
  end: number;
}

/** What we know about the chosen input file. Every field is optional. */
export interface SourceMeta {
  duration?: number;
  width?: number;
  height?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasSubtitles?: boolean;
}

export const FPS_MIN = 10;
export const FPS_MAX = 60;
export const GIF_FPS_MAX = 30;
export const FPS_TICKS = [12, 15, 24, 25, 30, 50, 60] as const;
export const AUDIO_BITRATES = [64, 96, 128, 160, 192, 256, 320] as const;
export const SIZE_PRESETS: readonly { id: SizePreset; label: string; short?: number }[] = [
  { id: "original", label: "Original" },
  { id: "2160", label: "2160p (4K)", short: 2160 },
  { id: "1440", label: "1440p", short: 1440 },
  { id: "1080", label: "1080p (Full HD)", short: 1080 },
  { id: "720", label: "720p (HD)", short: 720 },
  { id: "480", label: "480p", short: 480 },
  { id: "360", label: "360p", short: 360 },
  { id: "custom", label: "Custom…" },
];
export const MAX_DIMENSION = 7680;

export const DEFAULT_SETTINGS: Settings = {
  quality: 60,
  fps: null,
  gifFps: 12,
  size: { preset: "original", width: 1280, height: 720, lockAspect: true },
  gifSize: { preset: "custom", width: 480, height: 270, lockAspect: true },
  pixFmt: "yuv420p",
  audio: "stereo",
  audioBitrate: 128,
  audioOnlyBitrate: 192,
  speed: "fast",
  rotate: 0,
};

// ---------------------------------------------------------------------------
// Validation of persisted values (localStorage can hold anything).

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const pick = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function sanitizeFps(v: unknown, max: number, fallback: number | null): number | null {
  if (v === null) return null;
  return isNum(v) ? clamp(Math.round(v), FPS_MIN, max) : fallback;
}

function sanitizeSize(v: unknown, fallback: SizeSetting): SizeSetting {
  if (!v || typeof v !== "object") return { ...fallback };
  const o = v as Record<string, unknown>;
  return {
    preset: pick(o.preset, SIZE_PRESETS.map((p) => p.id), fallback.preset),
    width: isNum(o.width) ? clamp(Math.round(o.width), 2, MAX_DIMENSION) : fallback.width,
    height: isNum(o.height) ? clamp(Math.round(o.height), 2, MAX_DIMENSION) : fallback.height,
    lockAspect: typeof o.lockAspect === "boolean" ? o.lockAspect : fallback.lockAspect,
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, size: { ...d.size }, gifSize: { ...d.gifSize } };
  const o = raw as Record<string, unknown>;
  return {
    quality: isNum(o.quality) ? clamp(Math.round(o.quality), 0, 100) : d.quality,
    fps: sanitizeFps(o.fps, FPS_MAX, d.fps),
    gifFps: sanitizeFps(o.gifFps, GIF_FPS_MAX, d.gifFps),
    size: sanitizeSize(o.size, d.size),
    gifSize: sanitizeSize(o.gifSize, d.gifSize),
    pixFmt: pick(o.pixFmt, ["yuv420p", "yuv422p", "yuv444p"] as const, d.pixFmt),
    audio: pick(o.audio, ["stereo", "mono", "none"] as const, d.audio),
    audioBitrate: pick(o.audioBitrate, AUDIO_BITRATES, d.audioBitrate),
    audioOnlyBitrate: pick(o.audioOnlyBitrate, AUDIO_BITRATES, d.audioOnlyBitrate),
    speed: pick(o.speed, ["fastest", "fast", "balanced", "smallest"] as const, d.speed),
    rotate: pick(o.rotate, [0, 90, 180, 270] as const, d.rotate),
  };
}

/** How many settings differ from the defaults (for the drawer badge). */
export function countChanged(s: Settings): number {
  const d = DEFAULT_SETTINGS;
  const sizeEq = (a: SizeSetting, b: SizeSetting) =>
    a.preset === b.preset &&
    (a.preset !== "custom" || (a.width === b.width && a.height === b.height && a.lockAspect === b.lockAspect));
  return [
    s.quality !== d.quality,
    s.fps !== d.fps,
    s.gifFps !== d.gifFps,
    !sizeEq(s.size, d.size),
    !sizeEq(s.gifSize, d.gifSize),
    s.pixFmt !== d.pixFmt,
    s.audio !== d.audio,
    s.audioBitrate !== d.audioBitrate,
    s.audioOnlyBitrate !== d.audioOnlyBitrate,
    s.speed !== d.speed,
    s.rotate !== d.rotate,
  ].filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Which controls apply to the chosen format.

export interface Availability {
  enabled: boolean;
  /** Short reason shown when the control is greyed out. */
  reason?: string;
}

export interface ControlAvailability {
  quality: Availability;
  frameRate: Availability;
  trim: Availability;
  dimensions: Availability;
  pixFmt: Availability;
  /** Pixel formats beyond 4:2:0 (x264 only). */
  pixFmtHigh: Availability;
  audio: Availability;
  /** "No audio" option (not for audio-only formats). */
  audioNone: Availability;
  audioBitrate: Availability;
  speed: Availability;
  rotate: Availability;
}

const on: Availability = { enabled: true };
const off = (reason: string): Availability => ({ enabled: false, reason });

export function getAvailability(
  format: FormatDef,
  meta: SourceMeta,
  settings: Settings,
  hasFile: boolean,
): ControlAvailability {
  const audioOnly = format.video === null;
  const isGif = format.video === "gif";
  const noSourceAudio = meta.hasAudio === false;
  const audioMode = effectiveAudioMode(settings.audio, format);

  const audio = isGif
    ? off("GIFs have no sound")
    : noSourceAudio
      ? off("Your file has no sound")
      : on;

  return {
    quality: audioOnly ? off("Use Audio bitrate below") : on,
    frameRate: audioOnly ? off("Audio only — there are no frames") : on,
    trim: !hasFile
      ? off("Choose a file first")
      : meta.duration && meta.duration > 0
        ? on
        : off("Reading the clip length…"),
    dimensions: audioOnly ? off("Audio only — there is no picture") : on,
    pixFmt: audioOnly
      ? off("Audio only — there is no picture")
      : isGif
        ? off("GIFs use a 256-colour palette")
        : on,
    pixFmtHigh: format.video === "libx264" ? on : off("WebM supports 4:2:0 only"),
    audio,
    audioNone: audioOnly ? off("Audio formats need sound") : on,
    audioBitrate: !audio.enabled
      ? audio
      : format.audio === "pcm_s16le"
        ? off("WAV is uncompressed")
        : audioMode === "none"
          ? off("Audio is turned off")
          : on,
    speed: audioOnly || isGif ? off(isGif ? "GIF encoding has one speed" : "Audio encodes quickly") : on,
    rotate: audioOnly ? off("Audio only — there is no picture") : on,
  };
}

// ---------------------------------------------------------------------------
// Effective values: what a setting means for a given format.

/** "No audio" is not allowed for audio-only formats; fall back to stereo. */
export function effectiveAudioMode(mode: AudioMode, format: FormatDef): AudioMode {
  return format.video === null && mode === "none" ? "stereo" : mode;
}

export function effectivePixFmt(pixFmt: PixelFormat, format: FormatDef): PixelFormat {
  return format.video === "libx264" ? pixFmt : "yuv420p";
}

export function fpsFor(settings: Settings, format: FormatDef): number | null {
  return format.video === "gif" ? settings.gifFps : settings.fps;
}

export function sizeFor(settings: Settings, format: FormatDef): SizeSetting {
  return format.video === "gif" ? settings.gifSize : settings.size;
}

/** Highest bitrate an encoder accepts for the channel count (Vorbis mono tops out at 192 kbps). */
export function maxAudioBitrate(format: FormatDef, mode: AudioMode): number {
  return format.audio === "libvorbis" && mode === "mono" ? 192 : 320;
}

/** The audio bitrate (kbps) that will be used, after the encoder's limit. */
export function bitrateFor(settings: Settings, format: FormatDef): number {
  const chosen = format.video === null ? settings.audioOnlyBitrate : settings.audioBitrate;
  return Math.min(chosen, maxAudioBitrate(format, effectiveAudioMode(settings.audio, format)));
}

/** Source dimensions after rotation, when known. */
export function orientedSourceSize(meta: SourceMeta, rotate: Rotation): { w: number; h: number } | null {
  if (!meta.width || !meta.height) return null;
  return rotate === 90 || rotate === 270 ? { w: meta.height, h: meta.width } : { w: meta.width, h: meta.height };
}

/** Presets to offer: hide sizes larger than the source when the source size is known. */
export function sizePresetsFor(meta: SourceMeta) {
  const short = meta.width && meta.height ? Math.min(meta.width, meta.height) : undefined;
  return SIZE_PRESETS.filter((p) => !p.short || !short || p.short <= short);
}

export function roundEven(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Custom size as it will be encoded. With lockAspect and a known source
 * shape, height follows width. Returns height 0 when it must be derived by
 * FFmpeg (aspect unknown).
 */
export function resolveCustomSize(
  size: SizeSetting,
  meta: SourceMeta,
  rotate: Rotation,
  evenOnly: boolean,
): { width: number; height: number } {
  const src = orientedSourceSize(meta, rotate);
  const fix = (n: number) => (evenOnly ? roundEven(n) : Math.max(1, Math.round(n)));
  const width = fix(size.width);
  if (size.lockAspect) {
    return { width, height: src ? fix(width * (src.h / src.w)) : 0 };
  }
  return { width, height: fix(size.height) };
}
