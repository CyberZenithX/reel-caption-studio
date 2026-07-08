import { ReelState, CaptionSegment } from '../types';
import RichText from './RichText';

interface Props {
  state: ReelState;
  patch: (p: Partial<ReelState>) => void;
  onBg: (file: File) => void;
  clearBg: () => void;
  addSegment: () => void;
  updateSegment: (id: string, p: Partial<CaptionSegment>) => void;
  removeSegment: (id: string) => void;
  moveSegment: (id: string, dir: -1 | 1) => void;
  onExport: () => void;
  exporting: boolean;
  progress: { phase: string; ratio: number } | null;
}

export default function Editor(props: Props) {
  const { state, patch } = props;

  return (
    <div className="editor">
      <header className="editor-head">
        <h1>Reel Caption Studio</h1>
        <p>Timed caption boxes over a looping background. Export a 1080×1920 mp4.</p>
      </header>

      <section className="group">
        <h2>Background</h2>
        <label className="filebtn">
          {state.bgName ? 'Replace background' : 'Upload video or image'}
          <input
            type="file"
            accept="video/*,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onBg(f);
              e.target.value = '';
            }}
          />
        </label>
        {state.bgName && (
          <div className="file-row">
            <span className="file-name" title={state.bgName}>
              {state.bgType === 'video' ? '🎬' : '🖼️'} {state.bgName}
            </span>
            <button className="link-btn" onClick={props.clearBg}>
              Remove
            </button>
          </div>
        )}
      </section>

      <section className="group">
        <h2>Hook line</h2>
        <p className="hint">Fades in at its start time and stays until the end. Leave empty to skip.</p>
        <RichText
          html={state.hookHtml}
          rtl={state.hookRtl}
          accentColor={state.accentColor}
          placeholder="Top line…"
          onChange={(h) => patch({ hookHtml: h })}
        />
        <div className="seg-controls">
          <label className="mini">
            Appears at
            <input
              type="number"
              min={0}
              max={state.totalSec}
              step={0.5}
              value={state.hookAppearSec}
              onChange={(e) => patch({ hookAppearSec: Number(e.target.value) })}
            />
            s
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={state.hookRtl}
              onChange={(e) => patch({ hookRtl: e.target.checked })}
            />
            RTL
          </label>
        </div>
      </section>

      <section className="group">
        <div className="group-head">
          <h2>Captions</h2>
          <button className="add-btn" onClick={props.addSegment}>
            + Add
          </button>
        </div>
        <p className="hint">
          Each box fades in at its start time and stays until the end. Select text
          and tap a color to emphasize words.
        </p>

        {state.segments.map((seg, i) => (
          <div className="segment" key={seg.id}>
            <div className="segment-top">
              <span className="seg-index">{i + 1}</span>
              <div className="seg-move">
                <button
                  className="icon-btn"
                  disabled={i === 0}
                  onClick={() => props.moveSegment(seg.id, -1)}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  disabled={i === state.segments.length - 1}
                  onClick={() => props.moveSegment(seg.id, 1)}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => props.removeSegment(seg.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
            <RichText
              html={seg.html}
              rtl={seg.rtl}
              accentColor={state.accentColor}
              placeholder="Caption text…"
              onChange={(h) => props.updateSegment(seg.id, { html: h })}
            />
            <div className="seg-controls">
              <label className="mini">
                Appears at
                <input
                  type="number"
                  min={0}
                  max={state.totalSec}
                  step={0.5}
                  value={seg.appearSec}
                  onChange={(e) =>
                    props.updateSegment(seg.id, { appearSec: Number(e.target.value) })
                  }
                />
                s
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={seg.rtl}
                  onChange={(e) => props.updateSegment(seg.id, { rtl: e.target.checked })}
                />
                RTL
              </label>
            </div>
          </div>
        ))}
      </section>

      <section className="group">
        <h2>Style &amp; timing</h2>
        <label className="slider">
          <span>Accent color</span>
          <input
            type="color"
            value={state.accentColor}
            onChange={(e) => patch({ accentColor: e.target.value })}
          />
        </label>
        <label className="slider">
          <span>Total length: {state.totalSec}s</span>
          <input
            type="range"
            min={2}
            max={60}
            step={1}
            value={state.totalSec}
            onChange={(e) => patch({ totalSec: Number(e.target.value) })}
          />
        </label>
        <label className="slider">
          <span>Font size: {state.fontSize}px</span>
          <input
            type="range"
            min={28}
            max={72}
            step={1}
            value={state.fontSize}
            onChange={(e) => patch({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="slider">
          <span>Stack from top: {state.firstBoxTop}px</span>
          <input
            type="range"
            min={120}
            max={1200}
            step={10}
            value={state.firstBoxTop}
            onChange={(e) => patch({ firstBoxTop: Number(e.target.value) })}
          />
        </label>
        <label className="slider">
          <span>Box width: {state.maxBoxWidth}px</span>
          <input
            type="range"
            min={500}
            max={1000}
            step={10}
            value={state.maxBoxWidth}
            onChange={(e) => patch({ maxBoxWidth: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="group export-group">
        <button className="export-btn" onClick={props.onExport} disabled={props.exporting}>
          {props.exporting ? 'Exporting…' : 'Export mp4'}
        </button>
        {props.progress && (
          <div className="progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${Math.round(props.progress.ratio * 100)}%` }}
              />
            </div>
            <span className="progress-label">
              {props.progress.phase} · {Math.round(props.progress.ratio * 100)}%
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
