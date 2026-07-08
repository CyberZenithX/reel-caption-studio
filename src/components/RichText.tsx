import { useEffect, useRef } from 'react';
import { sanitizeHtml } from '../lib/util';
import { SWATCHES } from '../types';

interface Props {
  html: string;
  rtl: boolean;
  placeholder?: string;
  accentColor: string;
  onChange: (html: string) => void;
}

export default function RichText({ html, rtl, placeholder, accentColor, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>('');

  // Write DOM only on mount and on genuine external changes (avoids caret jumps).
  useEffect(() => {
    if (ref.current && html !== last.current) {
      ref.current.innerHTML = html;
      last.current = html;
    }
  }, [html]);

  const emit = () => {
    if (!ref.current) return;
    const clean = sanitizeHtml(ref.current.innerHTML);
    last.current = clean;
    onChange(clean);
  };

  const applyColor = (color: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !ref.current) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !ref.current.contains(range.commonAncestorContainer)) return;
    const span = document.createElement('span');
    span.style.color = color;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.addRange(nr);
    } catch {
      /* selection spanned incompatible nodes; ignore */
    }
    emit();
  };

  const swatches = Array.from(new Set([accentColor, ...SWATCHES]));

  return (
    <div className="richtext">
      <div
        ref={ref}
        className="rt-editable"
        contentEditable
        suppressContentEditableWarning
        dir={rtl ? 'rtl' : 'ltr'}
        data-placeholder={placeholder || ''}
        onInput={emit}
        onBlur={() => {
          if (ref.current) ref.current.innerHTML = sanitizeHtml(ref.current.innerHTML);
          emit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.execCommand('insertLineBreak');
            emit();
          }
        }}
      />
      <div className="rt-tools">
        <span className="rt-tools-label">Color selection:</span>
        {swatches.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            title={c}
            onMouseDown={(e) => {
              e.preventDefault();
              applyColor(c);
            }}
          />
        ))}
        <label className="swatch-custom" title="Custom color">
          <input
            type="color"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => applyColor(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
