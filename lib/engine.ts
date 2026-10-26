/**
 * The FFmpeg engine: downloads an FFmpeg core from a CDN, runs it in
 * ffmpeg.wasm's worker, and serialises every job (probe / convert) through
 * one queue. Two cores are supported:
 *
 * - "st": the single-thread core (default, most stable).
 * - "mt": the multi-thread core. Needs SharedArrayBuffer, i.e. a
 *   cross-origin-isolated page (COOP/COEP headers). Falls back to "st" if it
 *   can't start.
 *
 * Browser-only at call time; safe to import during prerender because
 * @ffmpeg/* is only loaded with dynamic import().
 */
import type { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { withThreadLimit } from "./ffmpeg-args";
import { safeExtension } from "./formats";
import type { SourceMeta } from "./settings";

export type EngineMode = "st" | "mt";

const CORE_VERSION = "0.12.10";

interface CoreFile {
  name: string;
  mime: string;
  /** Decoded size. CDNs serve these compressed, so Content-Length can't be used for progress. */
  bytes: number;
}

const CORES: Record<EngineMode, { pkg: string; files: CoreFile[] }> = {
  st: {
    pkg: "core",
    files: [
      { name: "ffmpeg-core.js", mime: "text/javascript", bytes: 112_059 },
      { name: "ffmpeg-core.wasm", mime: "application/wasm", bytes: 32_232_419 },
    ],
  },
  mt: {
    pkg: "core-mt",
    files: [
      { name: "ffmpeg-core.js", mime: "text/javascript", bytes: 129_115 },
      { name: "ffmpeg-core.wasm", mime: "application/wasm", bytes: 32_718_323 },
      { name: "ffmpeg-core.worker.js", mime: "text/javascript", bytes: 2_213 },
    ],
  },
};

const cdnBases = (pkg: string) => [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/${pkg}@${CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/${pkg}@${CORE_VERSION}/dist/umd`,
];

const totalBytes = (mode: EngineMode) => CORES[mode].files.reduce((n, f) => n + f.bytes, 0);

const INPUT_DIR = "/in";
const LOG_LIMIT = 400;
/** The multi-thread core spins up a pool of 32 workers; give up on it after this. */
const MT_LOAD_TIMEOUT_MS = 45_000;
/** Threads per stage for the multi-thread core (verified to fit its 32-worker pool). */
const MT_THREADS = 4;
/** No log or progress output for this long during a multi-thread run counts as a stall. */
const STALL_MS = 30_000;

export const MT_FALLBACK_NOTICE =
  "The multi-threaded engine couldn’t start in this browser, so the standard engine is being used.";

export type EnginePhase = "idle" | "downloading" | "initializing" | "ready" | "error";

export interface EngineState {
  phase: EnginePhase;
  /** The core being loaded or in use. */
  mode: EngineMode;
  /** Bytes of the core downloaded so far. */
  received: number;
  total: number;
  error: string | null;
  /** Set when the multi-thread core failed and the engine fell back to single-thread. */
  notice: string | null;
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
    super("Cancelled");
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
  /** Multi-thread only: called with true when output stops for a while, false when it resumes. */
  onStall?: (stalled: boolean) => void;
}

interface StagedInput {
  path: string;
  cleanup: () => Promise<unknown>;
}

interface CoreURLs {
  coreURL: string;
  wasmURL: string;
  workerURL?: string;
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

/** True when this page can run the multi-thread core. */
export function multiThreadSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.crossOriginIsolated === true &&
    typeof SharedArrayBuffer !== "undefined"
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

const INITIAL_STATE: EngineState = {
  phase: "idle",
  mode: "st",
  received: 0,
  total: totalBytes("st"),
  error: null,
  notice: null,
};

export class Engine {
  private state: EngineState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private urls = new Map<EngineMode, CoreURLs>();
  /** The mode the person asked for. */
  private wanted: EngineMode = "st";
  /** The multi-thread core failed; stay on single-thread until the mode is changed. */
  private mtFailed = false;
  /** Bumped whenever the running instance is discarded, so stale loads don't install themselves. */
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private logs: string[] = [];
  private onActivity: ((line: string | null) => void) | null = null;
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

  private get effectiveMode(): EngineMode {
    return this.wanted === "mt" && !this.mtFailed && multiThreadSupported() ? "mt" : "st";
  }

  /**
   * Choose the core. A change discards the current instance; the new core
   * loads lazily on the next load() (file chosen or conversion started).
   * Callers must not switch while a conversion runs.
   */
  setMode(mode: EngineMode) {
    if (mode === this.wanted) return;
    this.wanted = mode;
    this.mtFailed = false;
    this.discard();
    this.setState({
      phase: "idle",
      mode: this.effectiveMode,
      received: 0,
      total: totalBytes(this.effectiveMode),
      error: null,
      notice: null,
    });
  }

  /** Load the engine (idempotent). Resolves once FFmpeg is ready. */
  load(): Promise<FFmpeg> {
    if (this.ffmpeg && this.state.phase === "ready") return Promise.resolve(this.ffmpeg);
    if (!this.loading) {
      const attempt = this.doLoad(++this.generation);
      this.loading = attempt;
      attempt.catch(() => {
        if (this.loading === attempt) this.loading = null;
      });
    }
    return this.loading;
  }

  private async fetchCore(mode: EngineMode, gen: number): Promise<CoreURLs> {
    const cached = this.urls.get(mode);
    if (cached) return cached;
    const { pkg, files } = CORES[mode];
    const total = totalBytes(mode);
    let lastError: unknown;
    for (const base of cdnBases(pkg)) {
      const got = files.map(() => 0);
      const report = () => {
        if (gen === this.generation) this.setState({ received: Math.min(got.reduce((a, b) => a + b, 0), total) }, true);
      };
      try {
        this.setState({ phase: "downloading", mode, received: 0, total, error: null });
        const blobs = await Promise.all(
          files.map((f, i) => downloadToBlobURL(`${base}/${f.name}`, f.mime, (n) => ((got[i] = n), report()))),
        );
        const urls: CoreURLs = { coreURL: blobs[0], wasmURL: blobs[1], workerURL: blobs[2] };
        this.urls.set(mode, urls);
        return urls;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not download the converter engine");
  }

  /** Download (once) and start one core. */
  private async start(mode: EngineMode, gen: number): Promise<FFmpeg> {
    const urls = await this.fetchCore(mode, gen);
    if (gen !== this.generation) throw new CancelledError();
    this.setState({ phase: "initializing", mode, received: totalBytes(mode), total: totalBytes(mode), error: null });
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => this.handleLog(message));
    ff.on("progress", () => this.onActivity?.(null));
    try {
      const loading = ff.load(urls);
      await (mode === "mt" ? withTimeout(loading, MT_LOAD_TIMEOUT_MS, "Multi-threaded engine timed out") : loading);
    } catch (err) {
      ff.terminate();
      throw err;
    }
    if (gen !== this.generation) {
      ff.terminate();
      throw new CancelledError();
    }
    return ff;
  }

  private async doLoad(gen: number): Promise<FFmpeg> {
    const mode = this.effectiveMode;
    try {
      let ff: FFmpeg;
      try {
        ff = await this.start(mode, gen);
      } catch (err) {
        if (mode !== "mt" || err instanceof CancelledError || gen !== this.generation) throw err;
        // Multi-thread failed: fall back to the single-thread core and say so.
        this.mtFailed = true;
        this.setState({ notice: MT_FALLBACK_NOTICE });
        ff = await this.start("st", gen);
      }
      this.ffmpeg = ff;
      this.setState({ phase: "ready" });
      return ff;
    } catch (err) {
      if (gen === this.generation && !(err instanceof CancelledError)) {
        this.setState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
      }
      throw err;
    }
  }

  private handleLog(message: string) {
    this.logs.push(message);
    if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
    this.onActivity?.(message);
  }

  /** Run tasks one at a time: the core has a single file system. */
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

  /** Read duration / streams with ffprobe. */
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

      // Progress from "time=" stats lines; also feeds the stall watchdog.
      let lastActivity = Date.now();
      let stalled = false;
      this.onActivity = (line) => {
        lastActivity = Date.now();
        if (stalled) {
          stalled = false;
          job.onStall?.(false);
        }
        const t = line ? parseLogTime(line) : null;
        if (t !== null && job.expectedDuration) report(t / job.expectedDuration);
      };
      const onProgress = ({ progress }: { progress: number }) => {
        if (!job.expectedDuration) report(progress);
      };
      ff.on("progress", onProgress);
      const watchdog =
        this.state.mode === "mt" && job.onStall
          ? setInterval(() => {
              if (!stalled && Date.now() - lastActivity > STALL_MS) {
                stalled = true;
                job.onStall?.(true);
              }
            }, 2000)
          : null;

      try {
        input = await this.stageInput(ff, job.file, inputName);
        // ffprobe's "-v error" sticks to the shared wasm instance; restore FFmpeg's default
        // level so progress lines ("time=…") and useful error details are printed.
        let args = job.buildArgs(input.path, outputPath);
        if (this.state.mode === "mt") args = withThreadLimit(args, MT_THREADS);
        const code = await ff.exec(["-hide_banner", "-loglevel", "info", ...args]);
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
        if (watchdog) clearInterval(watchdog);
        this.onActivity = null;
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

  /** Throw away the running instance (and anything queued on it). */
  private discard() {
    const ff = this.ffmpeg;
    this.generation++;
    this.ffmpeg = null;
    this.loading = null;
    this.queue = Promise.resolve();
    this.onActivity = null;
    if (ff) ff.terminate();
  }

  private restart() {
    this.discard();
    if (this.urls.has(this.effectiveMode)) {
      this.setState({ phase: "initializing", mode: this.effectiveMode });
      this.load().catch(() => undefined);
    } else {
      this.setState({ phase: "idle", mode: this.effectiveMode });
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
