/**
 * The single source of truth for FFmpeg arguments. The same array drives the
 * real `exec()` call (with virtual file names) and the copyable command (with
 * the user's real file names). Pure module: no browser APIs.
 */
import type { FormatDef } from "./formats";
import {
  bitrateFor,
  effectiveAudioMode,
  effectivePixFmt,
  fpsFor,
  orientedSourceSize,
  resolveCustomSize,
  SIZE_PRESETS,
  sizeFor,
  type EncodingSpeed,
  type Settings,
  type SourceMeta,
  type Trim,
} from "./settings";

export interface ConvertOptions extends Settings {
  trim: Trim | null;
}

/** Seconds → "1.5", "10", "0.333" (max 3 decimals, trailing zeros trimmed). */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, seconds);
  return String(Number(s.toFixed(3)));
}

// Quality mappings ------------------------------------------------------------

export const x264Crf = (q: number) => Math.round(35 - 0.2 * q);
export const vp8Crf = (q: number) => Math.min(63, Math.max(4, Math.round(50 - 0.4 * q)));
export const gifColors = (q: number) => Math.round(32 + 2.24 * q);

const X264_PRESET: Record<EncodingSpeed, string> = {
  fastest: "ultrafast",
  fast: "veryfast",
  balanced: "faster",
  smallest: "medium",
};

const VP8_SPEED: Record<EncodingSpeed, { deadline: string; cpuUsed: number }> = {
  fastest: { deadline: "realtime", cpuUsed: 8 },
  fast: { deadline: "realtime", cpuUsed: 5 },
  balanced: { deadline: "realtime", cpuUsed: 3 },
  smallest: { deadline: "good", cpuUsed: 1 },
};

/** VP8's CRF mode needs a bitrate ceiling; scale it with the picture area. */
export function vp8BitrateCap(width?: number, height?: number): string {
  const px = width && height ? width * height : 1920 * 1080;
  if (px <= 640 * 360) return "1M";
  if (px <= 854 * 480) return "1500k";
  if (px <= 1280 * 720) return "3M";
  if (px <= 1920 * 1080) return "5M";
  if (px <= 2560 * 1440) return "9M";
  return "16M";
}

/** Trim window that actually changes something, or null for the full clip. */
export function effectiveTrim(trim: Trim | null, duration?: number): { ss?: number; t?: number } | null {
  if (!trim || !duration || duration <= 0) return null;
  const start = Math.max(0, Math.min(trim.start, duration));
  const end = Math.max(start, Math.min(trim.end, duration));
  const cutsStart = start >= 0.05;
  const cutsEnd = end <= duration - 0.05;
  if (!cutsStart && !cutsEnd) return null;
  return { ss: cutsStart ? start : undefined, t: cutsEnd ? end - start : undefined };
}

/** Length of the output in seconds, when known (used for progress). */
export function expectedDuration(options: ConvertOptions, meta: SourceMeta): number | undefined {
  if (!meta.duration) return undefined;
  const tr = effectiveTrim(options.trim, meta.duration);
  if (!tr) return meta.duration;
  const start = tr.ss ?? 0;
  return tr.t ?? meta.duration - start;
}

/** Output picture size, when it can be predicted (used for the VP8 bitrate cap). */
function predictedSize(options: ConvertOptions, format: FormatDef, meta: SourceMeta) {
  const src = orientedSourceSize(meta, options.rotate);
  const size = sizeFor(options, format);
  if (size.preset === "original") return src ?? undefined;
  if (size.preset === "custom") {
    const c = resolveCustomSize(size, meta, options.rotate, true);
    return c.height ? { w: c.width, h: c.height } : undefined;
  }
  const short = SIZE_PRESETS.find((p) => p.id === size.preset)?.short ?? 1080;
  if (!src) return { w: Math.round((short * 16) / 9), h: short };
  const k = short / Math.min(src.w, src.h);
  return { w: Math.round(src.w * k), h: Math.round(src.h * k) };
}

/** The scale filter for the current size setting, or null to keep the size. */
function scaleFilter(options: ConvertOptions, format: FormatDef, meta: SourceMeta): string | null {
  const isGif = format.video === "gif";
  const size = sizeFor(options, format);
  const flags = isGif ? ":flags=lanczos" : "";
  if (size.preset === "original") return null;
  if (size.preset === "custom") {
    const { width, height } = resolveCustomSize(size, meta, options.rotate, !isGif);
    return `scale=${width}:${height || -2}${flags}`;
  }
  const short = SIZE_PRESETS.find((p) => p.id === size.preset)?.short;
  if (!short) return null;
  // "1080p" means the short side: 1920×1080 landscape, 1080×1920 portrait.
  const src = orientedSourceSize(meta, options.rotate);
  const portrait = src ? src.h > src.w : false;
  return portrait ? `scale=${short}:-2${flags}` : `scale=-2:${short}${flags}`;
}

const ROTATE_FILTER: Record<number, string | null> = {
  0: null,
  90: "transpose=1",
  180: "hflip,vflip",
  270: "transpose=2",
};

/** Avoid shell/ffmpeg confusion for names that look like options. */
const safeName = (name: string) => (name.startsWith("-") ? `./${name}` : name);

export function buildArgs(
  options: ConvertOptions,
  format: FormatDef,
  meta: SourceMeta,
  inputName: string,
  outputName: string,
): string[] {
  const args: string[] = [];
  const trim = effectiveTrim(options.trim, meta.duration);

  if (trim?.ss !== undefined) args.push("-ss", formatSeconds(trim.ss));
  args.push("-i", safeName(inputName));
  if (trim?.t !== undefined) args.push("-t", formatSeconds(trim.t));

  // Video ---------------------------------------------------------------
  if (format.video === null) {
    args.push("-vn");
  } else {
    const filters: string[] = [];
    const fps = fpsFor(options, format);
    const rotate = ROTATE_FILTER[options.rotate];
    const scale = scaleFilter(options, format, meta);

    if (format.video === "gif") {
      if (fps) filters.push(`fps=${fps}`);
      if (rotate) filters.push(rotate);
      if (scale) filters.push(scale);
      const colors = gifColors(options.quality);
      filters.push(`split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse`);
      args.push("-vf", filters.join(","), "-loop", "0");
    } else {
      if (rotate) filters.push(rotate);
      if (scale) {
        filters.push(scale);
      } else if (format.video === "libx264" && meta.width && meta.height && (meta.width % 2 || meta.height % 2)) {
        // x264 with chroma subsampling needs even dimensions.
        filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
      }
      if (filters.length) args.push("-vf", filters.join(","));
      if (fps) args.push("-r", String(fps));

      if (format.video === "libx264") {
        args.push(
          "-c:v", "libx264",
          "-preset", X264_PRESET[options.speed],
          "-crf", String(x264Crf(options.quality)),
          "-pix_fmt", effectivePixFmt(options.pixFmt, format),
        );
      } else {
        const speed = VP8_SPEED[options.speed];
        const out = predictedSize(options, format, meta);
        args.push(
          "-c:v", "libvpx",
          "-deadline", speed.deadline,
          "-cpu-used", String(speed.cpuUsed),
          "-crf", String(vp8Crf(options.quality)),
          "-b:v", vp8BitrateCap(out?.w, out?.h),
        );
      }
    }
  }

  // Audio ---------------------------------------------------------------
  if (format.audio !== null && meta.hasAudio !== false) {
    const mode = effectiveAudioMode(options.audio, format);
    if (mode === "none") {
      args.push("-an");
    } else {
      args.push("-c:a", format.audio);
      if (format.audio !== "pcm_s16le") args.push("-b:a", `${bitrateFor(options, format)}k`);
      args.push("-ac", mode === "mono" ? "1" : "2");
      // Vorbis rejects some bitrates at low sample rates; 48 kHz keeps every option valid.
      if (format.audio === "libvorbis") args.push("-ar", "48000");
    }
  }

  if (meta.hasSubtitles && format.video !== null) args.push("-sn");
  if (format.faststart) args.push("-movflags", "+faststart");

  args.push(safeName(outputName));
  return args;
}

/**
 * Exec-only: cap decoder, encoder and filter threads. The multi-thread wasm
 * core has a fixed pool of 32 workers; FFmpeg's automatic thread counts can
 * exhaust it and crash or hang. Native FFmpeg doesn't need this, so the
 * displayed command never includes it.
 */
export function withThreadLimit(args: readonly string[], threads: number): string[] {
  const n = String(threads);
  const i = args.indexOf("-i");
  if (i < 0) return [...args];
  return ["-filter_threads", n, ...args.slice(0, i), "-threads", n, ...args.slice(i, i + 2), "-threads", n, ...args.slice(i + 2)];
}

// Shell rendering ---------------------------------------------------------------

const SHELL_SAFE = /^[A-Za-z0-9_@%+=.\/-]+$/;
/** Option flags such as -c:v stay bare; ":" is harmless to POSIX shells. */
const FLAG = /^-[A-Za-z][A-Za-z0-9_]*(:[A-Za-z0-9_]+)?$/;

/**
 * POSIX-safe quoting: bare when safe, otherwise single quotes ('\'' for ').
 * Values with ":" "," "[" "]" ";" spaces or quotes are always quoted.
 */
export function shellQuote(arg: string): string {
  if (arg !== "" && (SHELL_SAFE.test(arg) || FLAG.test(arg))) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function toShellCommand(args: readonly string[]): string {
  return ["ffmpeg", ...args].map((a, i) => (i === 0 ? a : shellQuote(a))).join(" ");
}
