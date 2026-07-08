// ---- Fixed output canvas (Instagram Reels native) ----
export const STAGE_W = 1080;
export const STAGE_H = 1920;
export const FPS = 30;
export const FADE_SEC = 0.35; // fade-in duration for each caption box

export interface CaptionSegment {
  id: string;
  html: string; // rich text, may contain <span style="color:..."> runs
  appearSec: number; // when this box fades in
  rtl: boolean;
}

export interface ReelState {
  bgSrc: string | null; // object URL
  bgType: 'video' | 'image' | null;
  bgName: string | null;
  hookHtml: string; // optional top line ('' = none)
  hookRtl: boolean;
  hookAppearSec: number; // when the hook fades in
  segments: CaptionSegment[];
  accentColor: string; // default emphasis swatch
  totalSec: number; // full reel length
  fontSize: number; // px at 1080-wide stage
  firstBoxTop: number; // px offset of the stack from the top of the stage
  boxGap: number; // px gap between stacked boxes
  maxBoxWidth: number; // px
}

export const DEFAULT_STATE: ReelState = {
  bgSrc: null,
  bgType: null,
  bgName: null,
  hookHtml:
    '\u201CIf he dislikes one of her characteristics, he will be pleased with another.\u201D',
  hookRtl: false,
  hookAppearSec: 2,
  segments: [
    {
      id: 's1',
      html:
        '\u201CThat is not relationship advice. That is a <span style="color:#9E4B57">hadith</span> of Prophet <span style="color:#9E4B57">Muhammad</span> \uFDFA.\u201D',
      appearSec: 4,
      rtl: false,
    },
    {
      id: 's2',
      html: 'Read the caption for the full teaching.',
      appearSec: 5,
      rtl: false,
    },
  ],
  accentColor: '#9E4B57',
  totalSec: 10,
  fontSize: 46,
  firstBoxTop: 470,
  boxGap: 26,
  maxBoxWidth: 900,
};

export const SWATCHES = [
  '#262322', // default dark
  '#9E4B57', // muted maroon (matches the sample)
  '#B4884D', // warm gold
  '#3E6B57', // deep green
  '#2E5A88', // slate blue
  '#FFD60A', // bright accent
];
