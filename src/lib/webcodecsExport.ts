import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { STAGE_W, STAGE_H, FPS } from '../types';
import { videoTimeFor } from './util';
import { drawFrame, ExportInput, RasterBox } from './exporter';

export interface EncoderConfig {
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  hardwareAcceleration?: HardwareAcceleration;
}

// Cheap Android hardware encoders sometimes reject the full 1080x1920 frame;
// step down rather than fail outright. Each entry pairs a resolution with the
// codec strings to try at that size, from most- to least-capable profile.
const RESOLUTIONS: { width: number; height: number; codecs: string[]; bitrate: number }[] = [
  {
    width: STAGE_W,
    height: STAGE_H,
    codecs: ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'],
    bitrate: 8_000_000,
  },
  {
    width: 720,
    height: 1280,
    // Level 4.0 (not 3.1) even at this smaller size: 720x1280@30fps sits
    // right at 3.1's macroblock-rate ceiling, which risks rejection on
    // marginal hardware encoders; 4.0 gives headroom and is as widely
    // supported as 3.1 in practice.
    codecs: ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'],
    bitrate: 4_000_000,
  },
];

/**
 * Probe for a usable WebCodecs video encoder config, trying hardware
 * acceleration first, then falling back to no preference, at each
 * resolution/codec pairing in turn. Returns null when WebCodecs is
 * unavailable or nothing is supported -- the caller should fall back to the
 * MediaRecorder + ffmpeg path in that case.
 */
export async function pickEncoderConfig(): Promise<EncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;

  for (const res of RESOLUTIONS) {
    for (const codec of res.codecs) {
      for (const hardwareAcceleration of ['prefer-hardware', undefined] as const) {
        const config: VideoEncoderConfig = {
          codec,
          width: res.width,
          height: res.height,
          bitrate: res.bitrate,
          framerate: FPS,
          latencyMode: 'quality',
          avc: { format: 'avc' },
          ...(hardwareAcceleration ? { hardwareAcceleration } : {}),
        };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) {
            return {
              width: res.width,
              height: res.height,
              codec,
              bitrate: res.bitrate,
              hardwareAcceleration,
            };
          }
        } catch {
          /* unsupported combination; keep probing */
        }
      }
    }
  }
  return null;
}

const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 2;
const AUDIO_CODEC = 'mp4a.40.2'; // AAC-LC

async function pickAudioConfig(): Promise<AudioEncoderConfig | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  const config: AudioEncoderConfig = {
    codec: AUDIO_CODEC,
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: 128_000,
  };
  try {
    const support = await AudioEncoder.isConfigSupported(config);
    return support.supported ? config : null;
  } catch {
    return null;
  }
}

/** Wait for a video element to seek to (approximately) `time`, then settle
 *  on the next presented frame where the browser supports that signal. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timer);
      resolve();
    };
    const onSeeked = () => {
      // `seeked` can fire a tick before the frame is actually presented;
      // requestVideoFrameCallback (Chrome/Safari) confirms it landed. Fall
      // back to resolving immediately where that API doesn't exist.
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => finish());
      } else {
        finish();
      }
    };
    // A stuck seek (bad source, decoder hiccup) must never hang the export.
    const timer = setTimeout(finish, 2000);
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = time;
  });
}

/** Open a private, detached clone of the background video so this export
 *  doesn't fight the live preview's own currentTime effects over the same
 *  element. Shares the existing object URL, so nothing re-downloads. */
function openDetachedVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = src;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('background video failed to load for export'));
  });
}

/** Wait until the encoder's queue drains below the given size, so frames
 *  aren't produced (and held in memory) faster than they can be encoded. */
function waitForQueue(encoder: VideoEncoder, max: number): Promise<void> {
  if (encoder.encodeQueueSize <= max) return Promise.resolve();
  return new Promise((resolve) => {
    const onDequeue = () => {
      if (encoder.encodeQueueSize <= max) {
        encoder.removeEventListener('dequeue', onDequeue);
        resolve();
      }
    };
    encoder.addEventListener('dequeue', onDequeue);
  });
}

/**
 * Encode the reel with WebCodecs: each output frame is assigned an explicit
 * timestamp (i / FPS seconds), decoupled from wall-clock time, so a slow
 * device produces a slower export instead of a stuttering one. Falls back to
 * video-only if silent AAC audio isn't supported, rather than failing the
 * whole export over the least essential piece.
 */
export async function encodeWithWebCodecs(
  input: ExportInput,
  rasters: RasterBox[],
  cfg: EncoderConfig
): Promise<Blob> {
  const scale = cfg.width / STAGE_W;
  const totalFrames = Math.max(1, Math.round(input.totalSec * FPS));

  const audioCfg = await pickAudioConfig();

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: cfg.width, height: cfg.height, frameRate: FPS },
    audio: audioCfg
      ? { codec: 'aac', sampleRate: audioCfg.sampleRate, numberOfChannels: audioCfg.numberOfChannels }
      : undefined,
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error', e),
  });
  videoEncoder.configure({
    codec: cfg.codec,
    width: cfg.width,
    height: cfg.height,
    bitrate: cfg.bitrate,
    framerate: FPS,
    latencyMode: 'quality',
    avc: { format: 'avc' },
    ...(cfg.hardwareAcceleration ? { hardwareAcceleration: cfg.hardwareAcceleration } : {}),
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioCfg) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error('AudioEncoder error', e),
    });
    audioEncoder.configure(audioCfg);
  }

  // Detached clone of the background so this export doesn't race the live
  // preview element's own seek/play effects.
  let bgVideo: HTMLVideoElement | null = null;
  if (input.bgType === 'video' && input.bgEl instanceof HTMLVideoElement) {
    bgVideo = await openDetachedVideo(input.bgEl.currentSrc || input.bgEl.src);
  }

  const canvas = document.createElement('canvas');
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  const ctx = canvas.getContext('2d')!;

  const drawInput: ExportInput = { ...input, bgEl: bgVideo ?? input.bgEl };

  let lastSeeked = -Infinity;
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i / FPS;

      if (bgVideo) {
        const target = videoTimeFor(t, input.bgDurationSec, input.totalSec);
        // Several output frames map to the same source frame under slow-mo
        // stretch; skip redundant seeks rather than re-seeking every frame.
        if (Math.abs(target - lastSeeked) >= 1 / 60) {
          await seekTo(bgVideo, target);
          lastSeeked = target;
        }
      }

      drawFrame(ctx, drawInput, rasters, t, scale);

      await waitForQueue(videoEncoder, 8);
      const frame = new VideoFrame(canvas, { timestamp: (i * 1e6) / FPS, duration: 1e6 / FPS });
      videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();

      input.onProgress?.('Encoding video', (i + 1) / totalFrames);
    }

    if (audioEncoder && audioCfg) {
      // One silent buffer covering the whole reel; AAC-LC frames are 1024
      // samples, so round up so the muxed track is never shorter than video.
      const totalSamples = Math.ceil(input.totalSec * audioCfg.sampleRate);
      const frameSize = 1024;
      for (let offset = 0; offset < totalSamples; offset += frameSize) {
        const n = Math.min(frameSize, totalSamples - offset);
        const silence = new Float32Array(n * audioCfg.numberOfChannels);
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: audioCfg.sampleRate,
          numberOfFrames: n,
          numberOfChannels: audioCfg.numberOfChannels,
          timestamp: (offset * 1e6) / audioCfg.sampleRate,
          data: silence,
        });
        audioEncoder.encode(data);
        data.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
    }

    await videoEncoder.flush();
    videoEncoder.close();
  } catch (err) {
    try {
      videoEncoder.close();
    } catch {
      /* already closed */
    }
    try {
      audioEncoder?.close();
    } catch {
      /* already closed */
    }
    throw err;
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}
