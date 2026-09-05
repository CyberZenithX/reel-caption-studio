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
over the background frame-by-frame onto a 1080×1920 canvas.

There are two export paths:

- **WebCodecs (preferred).** Frame *i* is always encoded at exactly *i*/30 seconds,
  regardless of how long the device took to produce it — so a slow phone gets a
  slower export instead of a stuttering one. On Android this also routes through
  the phone's hardware H.264 encoder, so it's often *faster* than real time. The
  mp4 is muxed client-side (`mp4-muxer`, no wasm download) with the `moov` atom at
  the front and a silent AAC track alongside it. This is what fixed the laggy
  exports some users on slower phones were seeing: the old real-time recording
  could drop frames on a device too slow to composite at 30fps every tick, and the
  normalization step then duplicated frames to fill the resulting gaps — which is
  the stutter. If the device's hardware encoder rejects the native 1080×1920 frame,
  export steps down to 720×1280 automatically.
- **MediaRecorder + ffmpeg.wasm (fallback).** Used only when the browser has no
  usable WebCodecs video encoder (checked up front via
  `VideoEncoder.isConfigSupported`). Records the canvas in real time via
  `canvas.captureStream`, then always normalizes the result with `ffmpeg.wasm` into
  a clean, standards-compliant mp4 — forcing H.264 High, constant 30fps,
  `yuv420p`, `moov` atom at the front, and a silent AAC track, since raw browser
  recordings are variable-frame-rate, often put `moov` at the end, and have no
  audio track (exactly what makes Instagram and some CMSs throw an upload error).
  The ffmpeg core downloads once from unpkg on first use (needs internet that one
  time), then is cached; if it can't load, the raw recording is saved instead with
  a warning. Recording is **real time** here (a 10s reel takes ~10s).

Notes:
- A progress bar shows the current phase either way.
- Audio is a **silent track** by design (the background is muted, matching the
  style). Add trending audio in Instagram, or wire in a real track later.

## Extending it

- Layout/style constants and the default template live in `src/types.ts`.
- Everything that draws pixels is in `src/components/Stage.tsx` (preview + export
  share it) and `src/lib/exporter.ts` (compositing, fallback recording, transcode).
  The WebCodecs export path lives in `src/lib/webcodecsExport.ts` and reuses the
  same `drawFrame` compositor.
- To feed this from automation later, the whole reel is just the `ReelState` object
  in `src/types.ts` — serialize it to JSON and you have a render config.

## Stack

Vite + React + TypeScript · `html-to-image` (raster) · WebCodecs + `mp4-muxer`
(primary export) · `@ffmpeg/ffmpeg` (fallback export) · `@fontsource/poppins` +
`@fontsource/amiri` (bundled fonts).
