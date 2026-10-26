/** The curated output formats offered in the picker. */

export type FormatId = "mp4" | "webm" | "mov" | "mkv" | "gif" | "mp3" | "wav" | "m4a";

export type VideoCodec = "libx264" | "libvpx" | "gif";
export type AudioCodec = "aac" | "libvorbis" | "libmp3lame" | "pcm_s16le";

export interface FormatDef {
  id: FormatId;
  label: string;
  hint: string;
  group: "video" | "audio";
  ext: string;
  mime: string;
  /** Video encoder, or null for audio-only formats. */
  video: VideoCodec | null;
  /** Audio encoder, or null when the format carries no sound (GIF). */
  audio: AudioCodec | null;
  /** Move the MP4/MOV index to the front so playback can start before download ends. */
  faststart?: boolean;
}

export const FORMATS: readonly FormatDef[] = [
  { id: "mp4", label: "MP4", hint: "Plays everywhere", group: "video", ext: "mp4", mime: "video/mp4", video: "libx264", audio: "aac", faststart: true },
  { id: "webm", label: "WebM", hint: "Great for the web", group: "video", ext: "webm", mime: "video/webm", video: "libvpx", audio: "libvorbis" },
  { id: "mov", label: "MOV", hint: "Apple & editing apps", group: "video", ext: "mov", mime: "video/quicktime", video: "libx264", audio: "aac", faststart: true },
  { id: "mkv", label: "MKV", hint: "Flexible container", group: "video", ext: "mkv", mime: "video/x-matroska", video: "libx264", audio: "aac" },
  { id: "gif", label: "GIF", hint: "Silent looping clip", group: "video", ext: "gif", mime: "image/gif", video: "gif", audio: null },
  { id: "mp3", label: "MP3", hint: "Audio only", group: "audio", ext: "mp3", mime: "audio/mpeg", video: null, audio: "libmp3lame" },
  { id: "wav", label: "WAV", hint: "Audio, uncompressed", group: "audio", ext: "wav", mime: "audio/wav", video: null, audio: "pcm_s16le" },
  { id: "m4a", label: "M4A", hint: "Audio, small & clear", group: "audio", ext: "m4a", mime: "audio/mp4", video: null, audio: "aac", faststart: true },
];

export const DEFAULT_FORMAT: FormatId = "mp4";

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export function getFormat(id: FormatId): FormatDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FORMAT)!;
}

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === "string" && BY_ID.has(value as FormatId);
}

/** The download name: same base name, new extension. Avoids clobbering the original name. */
export function outputFileName(inputName: string, format: FormatDef): string {
  const dot = inputName.lastIndexOf(".");
  const base = (dot > 0 ? inputName.slice(0, dot) : inputName).trim() || "video";
  const inputExt = dot > 0 ? inputName.slice(dot + 1).toLowerCase() : "";
  const suffix = inputExt === format.ext ? "-converted" : "";
  return `${base}${suffix}.${format.ext}`;
}

/** Extension of a file name, lower-cased, safe for a virtual FS name. */
export function safeExtension(name: string, fallback = "bin"): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}
