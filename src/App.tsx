import { useEffect, useRef, useState, useCallback } from 'react';
import Editor from './components/Editor';
import Preview from './components/Preview';
import Stage from './components/Stage';
import { DEFAULT_STATE, ReelState, CaptionSegment } from './types';
import { uid, download, videoTimeFor, stretchRate } from './lib/util';
import { exportReel, ExportBox } from './lib/exporter';

export default function App() {
  const [state, setState] = useState<ReelState>(DEFAULT_STATE);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; ratio: number } | null>(null);

  const bgRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const prevUrl = useRef<string | null>(null);

  const patch = useCallback((p: Partial<ReelState>) => setState((s) => ({ ...s, ...p })), []);

  // ---- background handling ----
  const onBg = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
      prevUrl.current = url;
      const type: 'video' | 'image' = file.type.startsWith('video') ? 'video' : 'image';
      setState((s) => ({ ...s, bgSrc: url, bgType: type, bgName: file.name, bgDurationSec: null }));
      if (type === 'video') {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          if (v.duration && isFinite(v.duration)) {
            setState((s) => ({
              ...s,
              totalSec: Math.max(2, Math.round(v.duration)),
              bgDurationSec: v.duration,
            }));
          }
        };
        v.src = url;
      }
    },
    []
  );

  const clearBg = useCallback(() => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    prevUrl.current = null;
    patch({ bgSrc: null, bgType: null, bgName: null, bgDurationSec: null });
  }, [patch]);

  // ---- segment helpers ----
  const addSegment = () =>
    setState((s) => {
      const lastStart = s.segments.reduce((m, x) => Math.max(m, x.appearSec), 0);
      const seg: CaptionSegment = {
        id: uid(),
        html: 'New caption',
        appearSec: Math.min(s.totalSec, lastStart + 2),
        rtl: false,
      };
      return { ...s, segments: [...s.segments, seg] };
    });

  const updateSegment = (id: string, p: Partial<CaptionSegment>) =>
    setState((s) => ({
      ...s,
      segments: s.segments.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));

  const removeSegment = (id: string) =>
    setState((s) => ({ ...s, segments: s.segments.filter((x) => x.id !== id) }));

  const moveSegment = (id: string, dir: -1 | 1) =>
    setState((s) => {
      const idx = s.segments.findIndex((x) => x.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= s.segments.length) return s;
      const next = s.segments.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...s, segments: next };
    });

  // ---- preview clock ----
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let cur = t; // local clock so this effect doesn't need to restart every frame
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      cur = cur + dt >= state.totalSec ? 0 : cur + dt;
      setT(cur);
      // Keep the background video locked to the reel clock (stretched or
      // trimmed to totalSec) instead of drifting or wrapping on its own.
      const el = bgRef.current;
      if (el instanceof HTMLVideoElement) {
        const target = videoTimeFor(cur, state.bgDurationSec, state.totalSec);
        if (Math.abs(el.currentTime - target) > 0.15) el.currentTime = target;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, state.totalSec, state.bgDurationSec]);

  useEffect(() => {
    const el = bgRef.current;
    if (el instanceof HTMLVideoElement) {
      el.playbackRate = stretchRate(state.bgDurationSec, state.totalSec);
      if (playing) el.play().catch(() => {});
      else el.pause();
    }
  }, [playing, state.bgSrc, state.totalSec, state.bgDurationSec]);

  useEffect(() => {
    const el = bgRef.current;
    if (!playing && el instanceof HTMLVideoElement && el.duration) {
      el.currentTime = videoTimeFor(t, state.bgDurationSec, state.totalSec);
    }
  }, [t, playing, state.bgDurationSec, state.totalSec]);

  // ---- export ----
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setPlaying(false);
    setExporting(true);
    setProgress({ phase: 'Preparing', ratio: 0 });

    try {
      await (document as any).fonts?.ready;
      const host = hostRef.current!;
      const hostRect = host.getBoundingClientRect();
      const boxes: ExportBox[] = [];

      host.querySelectorAll<HTMLElement>('[data-export-id]').forEach((el) => {
        const id = el.dataset.exportId!;
        const r = el.getBoundingClientRect();
        const box: ExportBox = {
          el,
          x: r.left - hostRect.left,
          y: r.top - hostRect.top,
          w: r.width,
          h: r.height,
          appearSec: 0,
          always: false,
        };
        if (id === 'hook') {
          box.appearSec = state.hookAppearSec;
        } else if (id.startsWith('seg-')) {
          const seg = state.segments.find((s) => `seg-${s.id}` === id);
          box.appearSec = seg ? seg.appearSec : 0;
        }
        boxes.push(box);
      });

      const result = await exportReel({
        boxes,
        bgEl: bgRef.current,
        bgType: state.bgType,
        bgColor: '#111111',
        totalSec: state.totalSec,
        bgDurationSec: state.bgDurationSec,
        onProgress: (phase, ratio) => setProgress({ phase, ratio }),
      });

      const base = 'reel-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      download(result.blob, `${base}.${result.ext}`);

      if (!result.normalized) {
        alert(
          'The video encoder could not load (it downloads once and needs internet), ' +
            `so a raw .${result.ext} was saved without normalizing. It may error on ` +
            'some platforms. Reconnect and export again to get a clean, compatible mp4.'
        );
      }
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }, [exporting, state]);

  return (
    <div className="app">
      <Editor
        state={state}
        patch={patch}
        onBg={onBg}
        clearBg={clearBg}
        addSegment={addSegment}
        updateSegment={updateSegment}
        removeSegment={removeSegment}
        moveSegment={moveSegment}
        onExport={handleExport}
        exporting={exporting}
        progress={progress}
      />
      <Preview
        state={state}
        t={t}
        playing={playing}
        onToggle={() => setPlaying((p) => !p)}
        onScrub={(v) => {
          setPlaying(false);
          setT(v);
        }}
        bgRef={bgRef}
      />

      {/* Offscreen full-size stage used only to rasterize caption boxes for export */}
      <div className="export-host" ref={hostRef} aria-hidden>
        <Stage state={state} mode="export" currentTime={0} />
      </div>
    </div>
  );
}
