import { CSSProperties } from 'react';
import { ReelState, STAGE_W, STAGE_H } from '../types';
import { boxOpacity } from '../lib/util';

interface BoxProps {
  html: string;
  rtl: boolean;
  opacity: number;
  fontSize: number;
  maxWidth: number;
  exportId: string;
}

function CaptionBox({ html, rtl, opacity, fontSize, maxWidth, exportId }: BoxProps) {
  const style: CSSProperties = {
    opacity,
    fontSize,
    maxWidth,
    direction: rtl ? 'rtl' : 'ltr',
  };
  return (
    <div
      className="cap-box"
      data-export-id={exportId}
      style={style}
      dir={rtl ? 'rtl' : 'ltr'}
      dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
    />
  );
}

interface StageProps {
  state: ReelState;
  mode: 'preview' | 'export';
  currentTime: number;
  bgRef?: React.Ref<HTMLVideoElement | HTMLImageElement>;
}

export default function Stage({ state, mode, currentTime, bgRef }: StageProps) {
  const isExport = mode === 'export';
  const hasHook = state.hookHtml.trim().length > 0;

  const rootStyle: CSSProperties = {
    width: STAGE_W,
    height: STAGE_H,
    position: 'relative',
    overflow: 'hidden',
    background: isExport ? 'transparent' : '#111',
  };

  const stackStyle: CSSProperties = {
    position: 'absolute',
    top: state.firstBoxTop,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: state.boxGap,
    padding: '0 60px',
  };

  return (
    <div style={rootStyle}>
      {!isExport && state.bgSrc && state.bgType === 'video' && (
        <video
          ref={bgRef as React.Ref<HTMLVideoElement>}
          className="bg-media"
          src={state.bgSrc}
          muted
          loop
          playsInline
          preload="auto"
        />
      )}
      {!isExport && state.bgSrc && state.bgType === 'image' && (
        <img
          ref={bgRef as React.Ref<HTMLImageElement>}
          className="bg-media"
          src={state.bgSrc}
          alt=""
        />
      )}

      <div style={stackStyle}>
        {hasHook && (
          <CaptionBox
            html={state.hookHtml}
            rtl={state.hookRtl}
            opacity={isExport ? 1 : boxOpacity(currentTime, state.hookAppearSec)}
            fontSize={state.fontSize}
            maxWidth={state.maxBoxWidth}
            exportId="hook"
          />
        )}
        {state.segments.map((seg) => (
          <CaptionBox
            key={seg.id}
            html={seg.html}
            rtl={seg.rtl}
            opacity={isExport ? 1 : boxOpacity(currentTime, seg.appearSec)}
            fontSize={state.fontSize}
            maxWidth={state.maxBoxWidth}
            exportId={`seg-${seg.id}`}
          />
        ))}
      </div>
    </div>
  );
}
