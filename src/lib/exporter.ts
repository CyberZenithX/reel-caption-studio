import { toPng } from 'html-to-image';
import { STAGE_W, STAGE_H, FPS } from '../types';
import { boxOpacity, coverRect, stretchRate, videoTimeFor } from './util';

export interface ExportBox {
  el: HTMLElement; // full-size DOM node to rasterize
  x: number; // px in 1080x1920 stage space
  y: number;
  w: number;
  h: number;
  appearSec: number;
  always: boolean;
}

export interface ExportInput {
  boxes: ExportBox[];
  bgEl: HTMLVideoElement | HTMLImageElement | null;
  bgType: 'video' | 'image' | null;
  bgColor: string; // fallback fill when no media
  totalSec: number;
  bgDurationSec: number | null;
  onProgress?: (phase: string, ratio: number) => void;
}

export interface RasterBox {
  img: ImageBitmap;
  x: number;
  y: number;
  w: number;
  h: number;
  appearSec: number;
  always: boolean;
}

function loadBitmap(src: string): Promise<ImageBitmap> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img).then(res, rej);
    };
    img.onerror = () => rej(new Error('raster load failed'));
    img.src = src;
  });
}

const RECORDER_MIMES: { type: string; ext: 'mp4' | 'webm' }[] = [
  { type: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
  { type: 'video/mp4', ext: 'mp4' },
  { type: 'video/webm;codecs=vp9', ext: 'webm' },
  { type: 'video/webm;codecs=vp8', ext: 'webm' },
  { type: 'video/webm', ext: 'webm' },
];

function pickMime() {
  for (const m of RECORDER_MIMES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m.type)) {
      return m;
    }
  }
  return { type: '', ext: 'webm' as const };
}

/** Rasterize every overlay box to a bitmap once, up front. */
export async function rasterize(boxes: ExportBox[], onProgress?: ExportInput['onProgress']) {
  await (document as any).fonts?.ready;
  const out: RasterBox[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const dataUrl = await toPng(b.el, { pixelRatio: 1, cacheBust: true, skipFonts: false });
    const img = await loadBitmap(dataUrl);
    out.push({ img, x: b.x, y: b.y, w: b.w, h: b.h, appearSec: b.appearSec, always: b.always });
    onProgress?.('Rendering text', (i + 1) / boxes.length);
  }
  return out;
}

/**
 * Draw one composited frame at time t onto a canvas of size
 * (STAGE_W * scale) x (STAGE_H * scale). `scale` defaults to 1 (native
 * 1080x1920); a lower scale lets the WebCodecs path step down resolution
 * on devices whose hardware encoder rejects the native size, reusing this
 * exact compositing logic instead of a second draw path.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  input: ExportInput,
  rasters: RasterBox[],
  t: number,
  scale = 1
) {
  const w = STAGE_W * scale;
  const h = STAGE_H * scale;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = input.bgColor;
  ctx.fillRect(0, 0, w, h);

  const bg = input.bgEl;
  if (bg) {
    const sw = bg instanceof HTMLVideoElement ? bg.videoWidth : bg.naturalWidth;
    const sh = bg instanceof HTMLVideoElement ? bg.videoHeight : bg.naturalHeight;
    const r = coverRect(sw, sh, w, h);
    try {
      ctx.drawImage(bg, r.x, r.y, r.w, r.h);
    } catch {
      /* video not ready this tick */
    }
  }

  for (const b of rasters) {
    const op = boxOpacity(t, b.appearSec, b.always);
    if (op <= 0) continue;
    ctx.globalAlpha = op;
    ctx.drawImage(b.img, b.x * scale, b.y * scale, b.w * scale, b.h * scale);
  }
  ctx.globalAlpha = 1;
}

/**
 * Record the composited scene in real time using MediaRecorder.
 * Returns the recorded blob and its container extension.
 */
async function recordRealtime(
  input: ExportInput,
  rasters: RasterBox[]
): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext('2d')!;

  const mime = pickMime();
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(
    stream,
    mime.type ? { mimeType: mime.type, videoBitsPerSecond: 10_000_000 } : undefined
  );
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const bg = input.bgEl;
  if (bg instanceof HTMLVideoElement) {
    bg.muted = true;
    bg.loop = false;
    bg.currentTime = 0;
    bg.playbackRate = stretchRate(input.bgDurationSec, input.totalSec);
    try {
      await bg.play();
    } catch {
      /* autoplay of a muted video should be fine; ignore */
    }
  }

  drawFrame(ctx, input, rasters, 0);
  recorder.start();

  const start = performance.now();
  const totalMs = input.totalSec * 1000;

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = elapsed / 1000;
      if (bg instanceof HTMLVideoElement) {
        const target = videoTimeFor(t, input.bgDurationSec, input.totalSec);
        if (Math.abs(bg.currentTime - target) > 0.15) bg.currentTime = target;
      }
      drawFrame(ctx, input, rasters, t);
      input.onProgress?.('Recording', Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.type || 'video/webm' }));
  });
  recorder.stop();
  if (bg instanceof HTMLVideoElement) bg.pause();

  return { blob: await done, ext: mime.ext };
}

/**
 * Re-encode the raw recording into a clean, broadly-compatible mp4.
 *
 * Browser recordings (both the direct-mp4 and the webm paths) are variable
 * frame rate, often put the moov atom at the end, and have no audio track.
 * Instagram, TikTok and some CMSs reject exactly that. This normalizes to:
 *   - H.264 High @ constant 30fps, yuv420p
 *   - moov atom at the front (+faststart) for streaming/upload
 *   - a silent AAC track (some platforms require an audio stream)
 */
async function normalizeToMp4(
  src: Blob,
  srcExt: 'mp4' | 'webm',
  onProgress?: ExportInput['onProgress']
): Promise<Blob> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  ffmpeg.on('progress', ({ progress }) =>
    onProgress?.('Encoding mp4', Math.min(1, progress || 0))
  );
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  const inName = `in.${srcExt}`;
  await ffmpeg.writeFile(inName, await fetchFile(src));
  await ffmpeg.exec([
    '-i', inName,
    // silent stereo audio source; -shortest clamps it to the video length
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-vsync', 'cfr',
    '-crf', '20',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    'out.mp4',
  ]);
  const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
  return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
}

export interface ExportResult {
  blob: Blob;
  ext: 'mp4' | 'webm';
  normalized: boolean; // false = raw recording (compatibility not guaranteed)
}

export async function exportReel(input: ExportInput): Promise<ExportResult> {
  const rasters = await rasterize(input.boxes, input.onProgress);

  // Prefer a deterministic WebCodecs encode: frame i is always at i/FPS
  // seconds regardless of how long the device took to produce it, so a
  // slow phone gets a slower export instead of a stuttering one. On
  // Android this also routes through the hardware H.264 encoder.
  const { pickEncoderConfig, encodeWithWebCodecs } = await import('./webcodecsExport');
  const cfg = await pickEncoderConfig();
  if (cfg) {
    try {
      const blob = await encodeWithWebCodecs(input, rasters, cfg);
      return { blob, ext: 'mp4', normalized: true };
    } catch (err) {
      console.error('WebCodecs export failed, falling back to real-time recording', err);
    }
  }

  // Fallback for browsers without a usable WebCodecs encoder: record the
  // composited canvas in real time, then normalize with ffmpeg.wasm so the
  // mp4 is standards-clean and uploads everywhere. If ffmpeg can't load
  // (e.g. offline on first export), fall back further to the raw recording
  // so the user still gets a file.
  const recorded = await recordRealtime(input, rasters);
  try {
    const mp4 = await normalizeToMp4(recorded.blob, recorded.ext, input.onProgress);
    return { blob: mp4, ext: 'mp4', normalized: true };
  } catch (err) {
    console.error('mp4 normalize failed, returning raw recording', err);
    return { blob: recorded.blob, ext: recorded.ext, normalized: false };
  }
}
