"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Engine } from "@/lib/engine";
import { probeInBrowser } from "@/lib/media-probe";
import type { SourceMeta } from "@/lib/settings";

export interface SourceFile {
  id: number;
  file: File;
  meta: SourceMeta;
  /** Object URL of a poster frame, if the browser could decode the file. */
  poster?: string;
  /** The browser probe finished. */
  browserProbed: boolean;
  /** The browser could decode the file. */
  decodable?: boolean;
  /** FFmpeg's ffprobe finished (gives audio/subtitle streams, and duration for undecodable files). */
  engineProbed: boolean;
}

function mergeMeta(browser: SourceMeta, engine: SourceMeta | null, decodable: boolean | undefined): SourceMeta {
  // No readable streams at all: we know nothing, so don't rule any format out (the conversion will explain).
  if (!engine || (!engine.hasVideo && !engine.hasAudio)) return browser;
  return {
    // The browser applies rotation metadata, so prefer its size and duration.
    duration: browser.duration ?? engine.duration,
    width: browser.width ?? engine.width,
    height: browser.height ?? engine.height,
    // An MP3 with cover art has a "video" stream to ffprobe; trust the browser when it could decode.
    hasVideo: decodable ? browser.hasVideo : engine.hasVideo,
    hasAudio: engine.hasAudio,
    hasSubtitles: engine.hasSubtitles,
  };
}

/** The chosen input file, plus what we learn about it from the browser and from ffprobe. */
export function useSourceFile(engine: Engine, engineReady: boolean) {
  const [source, setSource] = useState<SourceFile | null>(null);
  const counter = useRef(0);

  const choose = useCallback(
    (file: File) => {
      const id = ++counter.current;
      setSource({ id, file, meta: {}, browserProbed: false, engineProbed: false });
      // Warm up the engine while the person picks a format.
      engine.load().catch(() => undefined);
      probeInBrowser(file)
        .catch(() => ({ decodable: false }) as Awaited<ReturnType<typeof probeInBrowser>>)
        .then(({ poster, decodable, ...meta }) => {
          const posterURL = poster ? URL.createObjectURL(poster) : undefined;
          setSource((s) => {
            if (s?.id !== id) {
              if (posterURL) URL.revokeObjectURL(posterURL);
              return s;
            }
            return {
              ...s,
              poster: posterURL,
              decodable,
              browserProbed: true,
              meta,
            };
          });
        });
    },
    [engine],
  );

  const clear = useCallback(() => {
    counter.current++;
    setSource(null);
  }, []);

  // Revoke the poster URL when it is replaced.
  const poster = source?.poster;
  useEffect(() => {
    return () => {
      if (poster) URL.revokeObjectURL(poster);
    };
  }, [poster]);

  // Once the engine is ready, ask ffprobe about streams the browser can't tell us about.
  const sourceId = source?.id;
  const sourceFile = source?.file;
  const needsEngineProbe = Boolean(source && !source.engineProbed && source.browserProbed);
  useEffect(() => {
    if (!engineReady || !needsEngineProbe || !sourceFile) return;
    let active = true;
    engine.probe(sourceFile).then(
      (probed) => {
        if (!active) return;
        setSource((s) =>
          s && s.id === sourceId ? { ...s, engineProbed: true, meta: mergeMeta(s.meta, probed, s.decodable) } : s,
        );
      },
      () => {
        if (active) setSource((s) => (s && s.id === sourceId ? { ...s, engineProbed: true } : s));
      },
    );
    return () => {
      active = false;
    };
  }, [engine, engineReady, needsEngineProbe, sourceFile, sourceId]);

  return { source, choose, clear };
}
