"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertIcon, FilmIcon, MusicIcon, UploadIcon } from "@/components/icons";
import { formatBytes, formatClock } from "@/lib/format-display";
import type { SourceFile } from "@/hooks/useSourceFile";
import styles from "./DropZone.module.css";

const ACCEPT =
  "video/*,audio/*,.mkv,.avi,.flv,.wmv,.ts,.mts,.m2ts,.3gp,.ogv,.vob,.mpg,.mpeg,.mxf,.asf,.rm,.f4v";
/** Above this, warn (non-blocking) that the browser may run out of memory. */
const LARGE_FILE_BYTES = 500 * 1024 * 1024;

interface DropZoneProps {
  source: SourceFile | null;
  onFile: (file: File) => void;
  /** A file is being dragged somewhere over the page. */
  pageDragging: boolean;
}

export function DropZone({ source, onFile, pageDragging }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const openPicker = () => inputRef.current?.click();

  const dragProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: () => setOver(false),
  };

  const state = over ? "over" : pageDragging ? "page" : undefined;

  return (
    <div className={styles.zone} data-drag={state} data-has-file={source ? true : undefined} {...dragProps}>
      <span className={styles.sprockets} data-edge="top" aria-hidden="true" />
      {source ? <SelectedFile source={source} onChange={openPicker} /> : <EmptyState onPick={openPicker} />}
      <span className={styles.sprockets} data-edge="bottom" aria-hidden="true" />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <button type="button" className={styles.target} onClick={onPick} aria-describedby="drop-hint">
      <span className={styles.targetIcon} aria-hidden="true">
        <UploadIcon size={26} />
      </span>
      <span className={styles.targetTitle}>Drop a video here</span>
      <span className={styles.targetSub}>or click to choose a file</span>
      <span id="drop-hint" className={styles.targetHint}>
        MP4 · MOV · MKV · WebM · AVI and more
      </span>
    </button>
  );
}

function SelectedFile({ source, onChange }: { source: SourceFile; onChange: () => void }) {
  const { file, meta, poster } = source;
  const audioOnly = meta.hasVideo === false;
  const details = [
    formatBytes(file.size),
    meta.duration ? formatClock(meta.duration, false) : null,
    meta.width && meta.height ? `${meta.width}×${meta.height}` : null,
  ].filter(Boolean);
  const reading = !source.browserProbed || (!meta.duration && !source.engineProbed);

  return (
    <div className={styles.selected}>
      <div className={styles.poster}>
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing to optimise
          <img src={poster} alt="" />
        ) : (
          <span className={styles.posterPlaceholder} aria-hidden="true">
            {audioOnly ? <MusicIcon size={34} /> : <FilmIcon size={34} />}
            {!source.browserProbed && <span className={styles.posterShimmer} />}
          </span>
        )}
        {meta.duration ? <span className={styles.durationBadge}>{formatClock(meta.duration, false)}</span> : null}
      </div>
      <div className={styles.fileInfo}>
        <div className={styles.fileText}>
          <p className={styles.fileName} title={file.name}>
            {file.name}
          </p>
          <p className={styles.fileMeta}>
            {details.join("  ·  ")}
            {reading && <span className={styles.reading}> · reading…</span>}
          </p>
        </div>
        <button type="button" className="link-btn" onClick={onChange}>
          Change file
        </button>
      </div>
      {file.size > LARGE_FILE_BYTES && (
        <p className={styles.warning}>
          <AlertIcon size={16} />
          This is a big file. Your browser may run out of memory — trimming it or choosing a smaller size helps.
        </p>
      )}
    </div>
  );
}
