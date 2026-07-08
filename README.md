# Reel Caption Studio

A small web tool for making the "timed caption box" reels — a looping background
(video or image), an optional persistent hook line, and caption boxes that fade in
one after another on a timeline. Live 9:16 preview, one-click **1080×1920 mp4**
export. Supports per-word coloring and Arabic (RTL + the ﷺ honorific).

## Run it

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).

Build a static version with `npm run build` and serve `dist/` anywhere.

## How to use

1. **Upload a background** — video or image. For video, cover-fits and loops; the
   reel length auto-fills from the clip (you can override it).
2. **Hook line** — the top line, with its own **Appears at** time so it fades in
   like the captions. Leave it empty if you don't want one.
3. **Captions** — add boxes, set when each one **appears** (seconds), reorder or
   delete. Boxes stack top-down and stay until the end, matching the sample look.
4. **Color words** — select text inside any box and tap a swatch (or the custom
   picker). Colors are stored as inline spans, so preview and export match.
5. **Arabic** — tick **RTL** on the hook or any caption for right-to-left text. The
   ﷺ glyph and Arabic script render via the bundled Amiri font.
6. **Style & timing** — accent color, total length, font size, stack position, box
   width.
7. **Export mp4** — composites everything and downloads the file.

## How the export works (worth knowing)

The exported frames are built from the **same DOM** you see in the preview, so what
you preview is what you get. Each caption box is rasterized once, then composited
over the live background frame-by-frame onto a 1080×1920 canvas, which is recorded.

The recording is then **always normalized** with `ffmpeg.wasm` into a clean,
standards-compliant mp4. Raw browser recordings are variable-frame-rate, often put
the `moov` atom at the end, and have no audio track — which is exactly what makes
Instagram and some CMSs throw an upload error. Normalization forces:

- H.264 High, **constant 30fps**, `yuv420p`
- `moov` atom at the front (`+faststart`)
- a **silent AAC audio track** (some platforms require an audio stream)

The ffmpeg core downloads once from unpkg on the first export (needs internet that
one time), then is cached. If it can't load, the raw recording is saved as a
fallback with a warning — reconnect and re-export for a clean file. **Chrome on
desktop is the most reliable.**

Notes:
- Recording is **real time** (a 10s reel takes ~10s), then encoding runs. A
  progress bar shows the phase.
- Audio is a **silent track** by design (the background is muted, matching the
  style). Add trending audio in Instagram, or wire in a real track later.

## Extending it

- Layout/style constants and the default template live in `src/types.ts`.
- Everything that draws pixels is in `src/components/Stage.tsx` (preview + export
  share it) and `src/lib/exporter.ts` (compositing, recording, transcode).
- To feed this from automation later, the whole reel is just the `ReelState` object
  in `src/types.ts` — serialize it to JSON and you have a render config.

## Stack

Vite + React + TypeScript · `html-to-image` (raster) · `@ffmpeg/ffmpeg` (mp4
fallback) · `@fontsource/poppins` + `@fontsource/amiri` (bundled fonts).
