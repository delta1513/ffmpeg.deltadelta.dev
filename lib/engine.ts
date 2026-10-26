/**
 * The FFmpeg engine: downloads the single-thread core from a CDN, runs it in
 * ffmpeg.wasm's worker, and serialises every job (probe / convert) through
 * one queue. Browser-only at call time; safe to import during prerender
 * because @ffmpeg/* is only loaded with dynamic import().
 */
import type { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { safeExtension } from "./formats";
import type { SourceMeta } from "./settings";

const CORE_VERSION = "0.12.10";
const CDN_BASES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
];
/** Decoded sizes. CDNs serve the files compressed, so Content-Length can't be used for progress. */
const CORE_JS_BYTES = 112_059;
const CORE_WASM_BYTES = 32_232_419;
export const CORE_TOTAL_BYTES = CORE_JS_BYTES + CORE_WASM_BYTES;

const INPUT_DIR = "/in";
const LOG_LIMIT = 400;

export type EnginePhase = "idle" | "downloading" | "initializing" | "ready" | "error";

export interface EngineState {
  phase: EnginePhase;
  /** Bytes of the core downloaded so far. */
  received: number;
  total: number;
  error: string | null;
}

export class ConversionError extends Error {
  constructor(
    message: string,
    readonly logs: string[],
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Conversion cancelled");
    this.name = "CancelledError";
  }
}

export interface ConvertJob {
  file: File;
  /** Builds the argument list for the given virtual input / output paths. */
  buildArgs: (inputPath: string, outputPath: string) => string[];
  outputExt: string;
  /** Output length in seconds, used to compute progress. */
  expectedDuration?: number;
  onProgress: (ratio: number) => void;
}

interface StagedInput {
  path: string;
  cleanup: () => Promise<unknown>;
}

interface CoreURLs {
  coreURL: string;
  wasmURL: string;
}

async function downloadToBlobURL(
  url: string,
  mime: string,
  onBytes: (received: number) => void,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) {
    const blob = await res.blob();
    onBytes(blob.size);
    return URL.createObjectURL(new Blob([blob], { type: mime }));
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    received += value.byteLength;
    onBytes(received);
  }
  return URL.createObjectURL(new Blob(chunks, { type: mime }));
}

/** Parse "time=00:01:02.34" from an FFmpeg stats line, in seconds. */
export function parseLogTime(line: string): number | null {
  const m = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const INITIAL_STATE: EngineState = { phase: "idle", received: 0, total: CORE_TOTAL_BYTES, error: null };

export class Engine {
  private state: EngineState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private urls: CoreURLs | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private logs: string[] = [];
  private onLogTime: ((seconds: number) => void) | null = null;
  private lastNotify = 0;

  static readonly SERVER_STATE: EngineState = INITIAL_STATE;

  getState = (): EngineState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Last lines FFmpeg printed during the most recent job. */
  recentLogs(count = 30): string[] {
    return this.logs.slice(-count);
  }

  private setState(patch: Partial<EngineState>, throttle = false) {
    this.state = { ...this.state, ...patch };
    const now = Date.now();
    if (throttle && now - this.lastNotify < 80) return;
    this.lastNotify = now;
    this.listeners.forEach((l) => l());
  }

  /** Load the engine (idempotent). Resolves once FFmpeg is ready. */
  load(): Promise<FFmpeg> {
    if (this.ffmpeg && this.state.phase === "ready") return Promise.resolve(this.ffmpeg);
    if (!this.loading) {
      const attempt = this.doLoad();
      this.loading = attempt;
      attempt.catch(() => {
        if (this.loading === attempt) this.loading = null;
      });
    }
    return this.loading;
  }

  private async fetchCore(): Promise<CoreURLs> {
    if (this.urls) return this.urls;
    let lastError: unknown;
    for (const base of CDN_BASES) {
      let js = 0;
      let wasm = 0;
      const report = () => this.setState({ received: Math.min(js + wasm, CORE_TOTAL_BYTES) }, true);
      try {
        this.setState({ phase: "downloading", received: 0, error: null });
        const [coreURL, wasmURL] = await Promise.all([
          downloadToBlobURL(`${base}/ffmpeg-core.js`, "text/javascript", (n) => ((js = n), report())),
          downloadToBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm", (n) => ((wasm = n), report())),
        ]);
        this.urls = { coreURL, wasmURL };
        this.setState({ received: CORE_TOTAL_BYTES });
        return this.urls;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not download the converter engine");
  }

  private async doLoad(): Promise<FFmpeg> {
    try {
      const urls = await this.fetchCore();
      this.setState({ phase: "initializing", error: null });
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => this.handleLog(message));
      await ff.load(urls);
      this.ffmpeg = ff;
      this.setState({ phase: "ready" });
      return ff;
    } catch (err) {
      this.setState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  private handleLog(message: string) {
    this.logs.push(message);
    if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
    if (this.onLogTime) {
      const t = parseLogTime(message);
      if (t !== null) this.onLogTime(t);
    }
  }

  /** Run tasks one at a time: the core has a single file system and thread. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Make the input readable by FFmpeg without copying it into wasm memory when possible. */
  private async stageInput(ff: FFmpeg, file: File, name: string): Promise<StagedInput> {
    try {
      try {
        await ff.createDir(INPUT_DIR);
      } catch {
        // Already exists.
      }
      const ok = await ff.mount("WORKERFS" as FFFSType, { files: [new File([file], name)] }, INPUT_DIR);
      if (ok === false) throw new Error("WORKERFS unavailable");
      return { path: `${INPUT_DIR}/${name}`, cleanup: () => ff.unmount(INPUT_DIR) };
    } catch {
      await ff.writeFile(name, new Uint8Array(await file.arrayBuffer()));
      return { path: name, cleanup: () => ff.deleteFile(name) };
    }
  }

  /** Read duration / streams with ffprobe. Used when the browser can't decode the file. */
  probe(file: File): Promise<SourceMeta | null> {
    return this.enqueue(async () => {
      const ff = await this.load();
      const input = await this.stageInput(ff, file, `probe.${safeExtension(file.name)}`);
      const out = "/probe.json";
      try {
        await ff.ffprobe([
          "-v", "error",
          "-show_entries", "format=duration:stream=codec_type,width,height",
          "-of", "json",
          input.path,
          "-o", out,
        ]);
        const text = await ff.readFile(out, "utf8");
        return parseProbe(typeof text === "string" ? text : new TextDecoder().decode(text));
      } catch {
        return null;
      } finally {
        await Promise.allSettled([ff.deleteFile(out), input.cleanup()]);
      }
    });
  }

  convert(job: ConvertJob): Promise<Uint8Array> {
    return this.enqueue(async () => {
      const ff = await this.load();
      this.logs = [];
      const inputName = `input.${safeExtension(job.file.name)}`;
      const outputPath = `/output.${job.outputExt}`;
      let input: StagedInput | null = null;

      let best = 0;
      const report = (ratio: number) => {
        if (!Number.isFinite(ratio)) return;
        const r = Math.min(0.999, Math.max(best, ratio));
        if (r > best) {
          best = r;
          job.onProgress(r);
        }
      };
      this.onLogTime = (t) => job.expectedDuration && report(t / job.expectedDuration);
      const onProgress = ({ progress }: { progress: number }) => {
        if (!job.expectedDuration) report(progress);
      };
      ff.on("progress", onProgress);

      try {
        input = await this.stageInput(ff, job.file, inputName);
        // ffprobe's "-v error" sticks to the shared wasm instance; restore FFmpeg's default
        // level so progress lines ("time=…") and useful error details are printed.
        const code = await ff.exec(["-hide_banner", "-loglevel", "info", ...job.buildArgs(input.path, outputPath)]);
        if (code !== 0) throw new ConversionError(`FFmpeg exited with code ${code}`, this.recentLogs());
        const data = await ff.readFile(outputPath);
        if (!(data instanceof Uint8Array) || data.byteLength === 0) {
          throw new ConversionError("FFmpeg produced an empty file", this.recentLogs());
        }
        job.onProgress(1);
        return data;
      } catch (err) {
        if (ff !== this.ffmpeg) throw new CancelledError();
        if (err instanceof ConversionError) throw err;
        // The wasm instance may be in a bad state (e.g. out of memory): start fresh.
        const logs = this.recentLogs();
        this.restart();
        throw new ConversionError(err instanceof Error ? err.message : String(err), logs);
      } finally {
        this.onLogTime = null;
        if (ff === this.ffmpeg) {
          ff.off("progress", onProgress);
          await Promise.allSettled([ff.deleteFile(outputPath), input?.cleanup()]);
        }
      }
    });
  }

  /** Stop whatever is running. The engine reloads from the cached core in the background. */
  cancel() {
    this.restart();
  }

  private restart() {
    const ff = this.ffmpeg;
    this.ffmpeg = null;
    this.loading = null;
    this.queue = Promise.resolve();
    if (ff) ff.terminate();
    if (this.urls) {
      this.setState({ phase: "initializing" });
      this.load().catch(() => undefined);
    } else {
      this.setState({ phase: "idle" });
    }
  }
}

function parseProbe(text: string): SourceMeta | null {
  try {
    const json = JSON.parse(text) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; width?: number; height?: number }[];
    };
    const streams = json.streams ?? [];
    const video = streams.find((s) => s.codec_type === "video");
    const duration = Number(json.format?.duration);
    return {
      duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      width: video?.width || undefined,
      height: video?.height || undefined,
      hasVideo: Boolean(video),
      hasAudio: streams.some((s) => s.codec_type === "audio"),
      hasSubtitles: streams.some((s) => s.codec_type === "subtitle"),
    };
  } catch {
    return null;
  }
}

let engine: Engine | null = null;

/** The page-wide engine instance. */
export function getEngine(): Engine {
  if (!engine) engine = new Engine();
  return engine;
}
