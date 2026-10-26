/**
 * Read duration, size and a poster frame using a detached <video> element.
 * Works for anything the browser can decode; resolves with `decodable: false`
 * otherwise (FFmpeg's ffprobe fills in the gaps later).
 */
import type { SourceMeta } from "./settings";

export interface BrowserProbe extends SourceMeta {
  decodable: boolean;
  /** A JPEG poster frame, when the browser could draw one. */
  poster?: Blob;
}

const TIMEOUT_MS = 10_000;

function once(target: EventTarget, events: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const done = (type: string) => {
      clearTimeout(timer);
      events.forEach((e) => target.removeEventListener(e, handler));
      resolve(type);
    };
    const handler = (e: Event) => done(e.type);
    const timer = setTimeout(() => done("timeout"), timeoutMs);
    events.forEach((e) => target.addEventListener(e, handler));
  });
}

function capturePoster(video: HTMLVideoElement): Promise<Blob | undefined> {
  const maxW = 640;
  const scale = Math.min(1, maxW / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(undefined);
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), "image/jpeg", 0.82));
}

export async function probeInBrowser(file: File): Promise<BrowserProbe> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  try {
    const loaded = await once(video, ["loadedmetadata", "error"], TIMEOUT_MS);
    if (loaded !== "loadedmetadata") return { decodable: false };

    // Some WebM files (e.g. from MediaRecorder) report Infinity until sought to the end.
    if (video.duration === Infinity) {
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await once(video, ["durationchange", "seeked"], 4000);
      video.currentTime = 0;
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    const hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
    const result: BrowserProbe = {
      decodable: true,
      duration,
      hasVideo,
      width: hasVideo ? video.videoWidth : undefined,
      height: hasVideo ? video.videoHeight : undefined,
    };
    if (!hasVideo) return result;

    video.currentTime = duration ? Math.min(1, duration * 0.1) : 0;
    const seeked = await once(video, ["seeked", "error"], 5000);
    if (seeked === "seeked" || video.readyState >= 2) {
      result.poster = await capturePoster(video);
    }
    return result;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
