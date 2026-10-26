"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { useEngine } from "@/hooks/useEngine";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useSourceFile } from "@/hooks/useSourceFile";
import { CancelledError, ConversionError, multiThreadSupported } from "@/lib/engine";
import { buildArgs, expectedDuration, type ConvertOptions } from "@/lib/ffmpeg-args";
import { outputFileName } from "@/lib/formats";
import { countChanged, DEFAULT_SETTINGS, getAvailability, type Settings, type SourceMeta, type Trim } from "@/lib/settings";
import { drawerOpenStore, formatStore, settingsStore } from "@/lib/stores";
import { AdvancedDrawer } from "./advanced/AdvancedDrawer";
import { DropZone } from "./DropZone";
import { ErrorNotice } from "./ErrorNotice";
import { FormatPicker, resolveFormat } from "./FormatPicker";
import { Progress, type RunningJob } from "./Progress";
import { Result, type ConversionResult } from "./Result";
import styles from "./Converter.module.css";
import stage from "./Stage.module.css";

type Job =
  | { status: "idle" }
  | ({ status: "running"; id: number } & RunningJob)
  | { status: "done"; result: ConversionResult }
  | { status: "error"; message: string; logs: string[] };

const EMPTY_META: SourceMeta = {};
const noSubscribe = () => () => {};

const FRIENDLY_ERROR = "That didn’t work. The file may be damaged or too large for your browser.";
const ENGINE_ERROR = "We couldn’t download the converter engine. Check your internet connection and try again.";

export function Converter() {
  const { engine, state: engineState } = useEngine();
  const [settings, setSettings] = usePersistentState(settingsStore);
  const [formatId, setFormatId] = usePersistentState(formatStore);
  const [drawerOpen, setDrawerOpen] = usePersistentState(drawerOpenStore);
  const { source, choose, clear } = useSourceFile(engine, engineState.phase === "ready");
  const [trimState, setTrimState] = useState<{ sourceId: number; trim: Trim } | null>(null);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const [pageDragging, setPageDragging] = useState(false);
  const jobId = useRef(0);
  // Cross-origin isolation can't change after load; false on the server and during hydration.
  const mtSupported = useSyncExternalStore(noSubscribe, multiThreadSupported, () => false);
  const useMultiThread = settings.multiThread && mtSupported;

  // Keep the engine on the chosen core. The drawer is locked while converting, so this never
  // switches mid-run; the new core loads lazily on the next file or conversion.
  useEffect(() => {
    engine.setMode(useMultiThread ? "mt" : "st");
  }, [engine, useMultiThread]);

  const meta = source?.meta ?? EMPTY_META;
  const format = resolveFormat(formatId, meta);
  const trim = source && trimState?.sourceId === source.id ? trimState.trim : null;
  const options: ConvertOptions = { ...settings, trim };
  const inputName = source?.file.name ?? "input.mp4";
  const outputName = source ? outputFileName(source.file.name, format) : outputFileName("output.mov", format);
  const commandArgs = buildArgs(options, format, meta, inputName, outputName);
  const availability = getAvailability(format, meta, settings, Boolean(source));
  const running = job.status === "running";

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [setSettings]);

  // Free the converted file's memory when it is replaced or dismissed.
  const resultURL = job.status === "done" ? job.result.url : null;
  useEffect(() => {
    return () => {
      if (resultURL) URL.revokeObjectURL(resultURL);
    };
  }, [resultURL]);

  const handleFile = useCallback(
    (file: File) => {
      if (running) return;
      setJob({ status: "idle" });
      choose(file);
    },
    [choose, running],
  );

  // Accept a dropped file anywhere on the page, and stop the browser from opening it.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setPageDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setPageDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = running ? "none" : "copy";
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setPageDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFile, running]);

  const start = async () => {
    if (!source || running) return;
    const id = ++jobId.current;
    const snapshot = { file: source.file, meta: source.meta, options, format, outputName };
    const isCurrent = () => jobId.current === id;
    const base = { status: "running", id, progress: 0, stalled: false, formatLabel: format.label } as const;
    setJob({ ...base, phase: "engine", startedAt: 0 });

    try {
      await engine.load();
      if (!isCurrent()) return;
      const startedAt = Date.now();
      setJob({ ...base, phase: "converting", startedAt });

      const data = await engine.convert({
        file: snapshot.file,
        buildArgs: (input, output) => buildArgs(snapshot.options, snapshot.format, snapshot.meta, input, output),
        outputExt: snapshot.format.ext,
        expectedDuration: expectedDuration(snapshot.options, snapshot.meta),
        onProgress: (progress) =>
          setJob((j) => (j.status === "running" && j.id === id ? { ...j, progress } : j)),
        onStall: (stalled) => setJob((j) => (j.status === "running" && j.id === id ? { ...j, stalled } : j)),
      });
      if (!isCurrent()) return;

      const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: snapshot.format.mime });
      setJob({
        status: "done",
        result: {
          url: URL.createObjectURL(blob),
          name: snapshot.outputName,
          size: blob.size,
          inputSize: snapshot.file.size,
          seconds: (Date.now() - startedAt) / 1000,
          format: snapshot.format,
        },
      });
    } catch (err) {
      if (!isCurrent() || err instanceof CancelledError) return;
      if (err instanceof ConversionError) {
        setJob({ status: "error", message: FRIENDLY_ERROR, logs: err.logs });
      } else {
        setJob({ status: "error", message: ENGINE_ERROR, logs: [err instanceof Error ? err.message : String(err)] });
      }
    }
  };

  const cancel = () => {
    if (job.status !== "running") return;
    jobId.current++;
    if (job.phase === "converting") engine.cancel();
    setJob({ status: "idle" });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setTrimState(null);
  };

  const status =
    job.status === "done"
      ? `Conversion finished. ${job.result.name} is ready to download.`
      : job.status === "error"
        ? "Conversion failed."
        : running && job.phase === "converting"
          ? `Converting to ${job.formatLabel}.`
          : "";

  return (
    <section className={`container ${styles.wrap}`} aria-label="Video converter">
      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>

      <div className={styles.card}>
        {job.status === "done" ? (
          <Result
            result={job.result}
            onConvertAnother={() => {
              setJob({ status: "idle" });
              clear();
            }}
            onAdjust={() => setJob({ status: "idle" })}
          />
        ) : (
          <>
            <div className={styles.columns} inert={running} data-locked={running || undefined}>
              <div className={styles.left}>
                <DropZone source={source} onFile={handleFile} pageDragging={pageDragging} />
              </div>
              <div className={styles.right}>
                <FormatPicker value={format.id} meta={meta} onChange={setFormatId} />
              </div>
            </div>

            <div className={styles.action}>
              {job.status === "error" && <ErrorNotice message={job.message} logs={job.logs} />}
              {engineState.notice && useMultiThread && <p className={styles.notice}>{engineState.notice}</p>}
              {job.status === "running" ? (
                <Progress job={job} engine={engineState} onCancel={cancel} />
              ) : (
                <>
                  <button type="button" className={stage.start} disabled={!source} onClick={start}>
                    Start Conversion
                    {source && <span className={stage.startTarget}>→ {format.label}</span>}
                    <ArrowRightIcon size={22} />
                  </button>
                  {!source && <p className={stage.startCaption}>Choose a file to begin.</p>}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <AdvancedDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
        settings={settings}
        update={update}
        onReset={resetSettings}
        changedCount={countChanged(settings) + (trim ? 1 : 0)}
        format={format}
        meta={meta}
        availability={availability}
        trim={trim}
        onTrimChange={(t) => source && setTrimState({ sourceId: source.id, trim: t })}
        commandArgs={commandArgs}
        inputName={inputName}
        outputName={outputName}
        locked={running}
        multiThreadSupported={mtSupported}
        engineNotice={engineState.notice}
      />
    </section>
  );
}
