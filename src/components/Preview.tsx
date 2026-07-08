import { useEffect, useRef, useState } from 'react';
import Stage from './Stage';
import { ReelState, STAGE_W, STAGE_H } from '../types';

interface Props {
  state: ReelState;
  t: number;
  playing: boolean;
  onToggle: () => void;
  onScrub: (t: number) => void;
  bgRef: React.Ref<HTMLVideoElement | HTMLImageElement>;
}

function fmt(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `0:${String(s).padStart(2, '0')}`;
}

export default function Preview({ state, t, playing, onToggle, onScrub, bgRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const pad = 24;
      const w = el.clientWidth - pad;
      const h = el.clientHeight - pad;
      setScale(Math.max(0.05, Math.min(w / STAGE_W, h / STAGE_H)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="preview">
      <div className="preview-stagewrap" ref={wrapRef}>
        <div
          className="preview-scaler"
          style={{
            width: STAGE_W * scale,
            height: STAGE_H * scale,
          }}
        >
          <div
            style={{
              width: STAGE_W,
              height: STAGE_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <Stage state={state} mode="preview" currentTime={t} bgRef={bgRef} />
          </div>
        </div>
      </div>

      <div className="transport">
        <button className="play-btn" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="tcode">{fmt(t)}</span>
        <input
          className="scrub"
          type="range"
          min={0}
          max={state.totalSec}
          step={0.05}
          value={t}
          onChange={(e) => onScrub(Number(e.target.value))}
        />
        <span className="tcode">{fmt(state.totalSec)}</span>
      </div>
    </div>
  );
}
