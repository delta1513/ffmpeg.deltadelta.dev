# ffmpeg.deltadelta.dev

A free, private video converter that runs entirely in your browser. Drop in a video, pick a format, press **Start Conversion**, download the result. Nothing is uploaded: the conversion runs on your device with [FFmpeg](https://ffmpeg.org/) compiled to WebAssembly ([ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)).

Live site: https://ffmpeg.deltadelta.dev

## What it does

- Converts to **MP4**, **WebM**, **MOV**, **MKV**, **GIF**, **MP3**, **WAV** and **M4A**.
- Shows a poster frame, size, length and resolution of the chosen file.
- Shows progress, elapsed time and time left, with a Cancel button.
- Previews the result and compares its size with the original.
- **Advanced settings** (saved in the browser): quality, frame rate, trim, dimensions, colour model, audio channels and bitrate, encoding speed, rotation, and an experimental **multi-threaded engine** toggle (off by default).
- **Run this yourself**: the exact `ffmpeg` command for the current settings, ready to copy and run with FFmpeg on your computer.

## How it works

- Next.js 16 (App Router) builds a static site (`output: "export"`). A Cloudflare Worker serves the files in `out/`.
- `lib/ffmpeg-args.ts` is the single source of truth for FFmpeg arguments. The same function builds the arguments for the in-browser run and for the copyable command.
- `lib/engine.ts` loads the FFmpeg core, queues jobs, reports progress and cancels jobs. Input files are mounted read-only (WORKERFS), so they are not copied into WebAssembly memory.
- `@ffmpeg/ffmpeg` is only loaded with dynamic `import()` in the browser, never during the static build.

### Why the FFmpeg core loads from jsDelivr

The single-thread core (`@ffmpeg/core@0.12.10`) is about 31 MB of WebAssembly. Cloudflare Workers static assets have a 25 MiB limit per file, so the site cannot host it. The browser downloads it once from jsDelivr (unpkg is the fallback) and caches it. The single-thread core is the default because it is the most stable.

### Multi-threaded engine and COOP/COEP headers

`public/_headers` sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for every path. This makes the page cross-origin isolated, which enables `SharedArrayBuffer`. The multi-threaded core (`@ffmpeg/core-mt@0.12.10`, also from jsDelivr with an unpkg fallback) needs it. Both CDNs send `Cross-Origin-Resource-Policy: cross-origin`, and the fonts are self-hosted, so nothing is blocked.

The toggle is disabled when the page is not cross-origin isolated (for example in `npm run dev`; use `npm run preview` to get the headers). The multi-threaded core has a fixed 1 GB memory limit and a pool of 32 worker threads, so the engine caps FFmpeg at 4 threads per stage (automatic thread counts exhaust the pool). If the core cannot start, the engine falls back to single-thread and shows a notice. If a multi-threaded run prints nothing for 30 seconds, the page suggests turning the toggle off. The copyable command is the same in both modes.

WebM uses VP8 video with Vorbis audio. The Opus encoder in this core build crashes on stereo audio, so Vorbis is used instead.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/` | Layout, home page, 404 page, global styles and design tokens |
| `components/converter/` | Drop zone, format picker, progress, result, error, advanced drawer |
| `components/ui/` | Sliders, trim slider, segmented controls, selects, switches |
| `hooks/` | Engine state, chosen file, persisted settings |
| `lib/` | Formats, settings, argument builder, engine, browser media probe |
| `public/llms.txt` | Site summary for AI agents |

## Development

```sh
npm install
npm run dev      # local dev server
npm run lint     # ESLint
npm run build    # static site in out/
npm run preview  # build, then serve out/ with wrangler dev
```

Cloudflare builds and deploys the site on every push to `main`. See `AGENTS.md` for the deployment rules.
