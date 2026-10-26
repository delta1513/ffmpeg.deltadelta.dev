"use client";

import { useState } from "react";
import { CheckIcon, DownloadIcon, RefreshIcon, SlidersIcon } from "@/components/icons";
import type { FormatDef } from "@/lib/formats";
import { formatBytes } from "@/lib/format-display";
import styles from "./Stage.module.css";

export interface ConversionResult {
  url: string;
  name: string;
  size: number;
  inputSize: number;
  seconds: number;
  format: FormatDef;
}

interface ResultProps {
  result: ConversionResult;
  onConvertAnother: () => void;
  onAdjust: () => void;
}

function sizeChange(input: number, output: number): string {
  if (!input || !output) return "—";
  const r = output / input;
  if (r < 0.995) return `${Math.round((1 - r) * 100)}% smaller`;
  if (r <= 1.005) return "About the same";
  return r < 2 ? `${Math.round((r - 1) * 100)}% larger` : `${r.toFixed(1)}× larger`;
}

function Preview({ result }: { result: ConversionResult }) {
  const [failed, setFailed] = useState(false);
  const { format, url } = result;
  if (failed) {
    return (
      <p className={styles.previewFallback}>
        Your browser can’t preview {format.label} files, but the download will work in other apps.
      </p>
    );
  }
  if (format.video === "gif") {
    // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing to optimise
    return <img src={url} alt="Preview of the converted GIF" onError={() => setFailed(true)} />;
  }
  if (format.group === "audio") {
    return (
      <div className={styles.audioPreview}>
        <audio controls src={url} onError={() => setFailed(true)}>
          <track kind="captions" />
        </audio>
      </div>
    );
  }
  return (
    <video controls playsInline src={url} onError={() => setFailed(true)}>
      <track kind="captions" />
    </video>
  );
}

export function Result({ result, onConvertAnother, onAdjust }: ResultProps) {
  return (
    <div className={styles.result}>
      <div className={styles.resultHead}>
        <span className={styles.doneBadge}>
          <CheckIcon size={14} strokeWidth={2.6} />
          Done
        </span>
        <h2 className={styles.resultTitle}>Your {result.format.label} is ready</h2>
      </div>

      <div className={styles.resultBody}>
        <div className={styles.preview} data-kind={result.format.group}>
          <Preview result={result} />
        </div>

        <div className={styles.resultSide}>
          <dl className={styles.stats}>
            <div>
              <dt>Original</dt>
              <dd className="tabular">{formatBytes(result.inputSize)}</dd>
            </div>
            <div>
              <dt>{result.format.label}</dt>
              <dd className="tabular">{formatBytes(result.size)}</dd>
            </div>
            <div data-accent>
              <dt>Change</dt>
              <dd>{sizeChange(result.inputSize, result.size)}</dd>
            </div>
          </dl>

          <div className={styles.downloadWrap}>
            <a className={`btn btn-primary btn-lg ${styles.download}`} href={result.url} download={result.name}>
              <DownloadIcon size={20} />
              Download {result.format.label}
            </a>
          </div>

          <div className={styles.resultLinks}>
            <button type="button" className="link-btn" onClick={onConvertAnother}>
              <RefreshIcon size={15} />
              Convert another
            </button>
            <button type="button" className="link-btn" onClick={onAdjust}>
              <SlidersIcon size={15} />
              Change settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
