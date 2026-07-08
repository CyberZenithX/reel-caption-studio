import { FADE_SEC } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 9);

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Opacity of a box at time t. alwaysVisible boxes (the hook) are always 1. */
export function boxOpacity(t: number, appearSec: number, always = false): number {
  if (always) return 1;
  if (t < appearSec) return 0;
  return clamp((t - appearSec) / FADE_SEC, 0, 1);
}

/** object-fit: cover math -> where to draw source media on a target canvas. */
export function coverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
) {
  if (!srcW || !srcH) return { x: 0, y: 0, w: dstW, h: dstH };
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

/** Very small allowlist sanitizer: keep text + <span style="color:..."> + <br>. */
export function sanitizeHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') continue;
      if (tag === 'span') {
        const color = el.style.color;
        const attrs = Array.from(el.attributes).map((a) => a.name);
        for (const a of attrs) el.removeAttribute(a);
        if (color) el.style.color = color;
        walk(el);
        continue;
      }
      // Unknown tag: unwrap it, keep its text/children.
      const parent = el.parentNode!;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
