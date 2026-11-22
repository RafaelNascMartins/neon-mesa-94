import { useEffect, useRef } from 'react';

/**
 * Renders a line of text in the game font, pixelated like the 3D scene: the text is drawn at
 * 1/`pixel` resolution, every pixel is snapped to fully on or off (no anti-aliasing), and the
 * canvas is scaled back up with nearest-neighbour so each texel becomes a hard `pixel`-sized block.
 * Hard drop shadows are stamped from the same 1-bit mask, so they stay on the pixel grid too.
 */

const FONT_FAMILY = '"Flat Book", "Pixelify Sans", monospace';

export interface PixelShadow {
  /** Offset in on-screen blocks (multiplied by `pixel`). */
  x: number;
  y: number;
  color: string;
}

interface PixelTextProps {
  text: string;
  /** On-screen font size in CSS px. */
  size: number;
  /** Size of one pixel block in CSS px. */
  pixel?: number;
  color?: string;
  shadows?: PixelShadow[];
  /** Letter spacing in blocks. */
  tracking?: number;
  /** Alpha threshold 0..1 — lower makes strokes chunkier. */
  threshold?: number;
  /** Thickens strokes by one texel (for big, thin-stroked lettering). */
  bold?: boolean;
  className?: string;
}

export function PixelText({
  text,
  size,
  pixel = 3,
  color = '#e9e4d8',
  shadows = [],
  tracking = 0,
  threshold = 0.42,
  bold: boldProp = false,
  className,
}: PixelTextProps) {
  const bold = boldProp ? 1 : 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shadowKey = shadows.map((s) => `${s.x},${s.y},${s.color}`).join('|');

  useEffect(() => {
    let cancelled = false;
    const low = Math.max(6, Math.round(size / pixel));
    const font = `${low}px ${FONT_FAMILY}`;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      // 1) Measure + draw the glyphs into a white mask at low resolution
      const mask = document.createElement('canvas');
      const mctx = mask.getContext('2d')!;
      mctx.font = font;
      const chars = [...text];
      const widths = chars.map((c) => mctx.measureText(c).width);
      const textW = Math.ceil(widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1)) + (bold ? 1 : 0);
      const pad = 1;
      const textH = Math.ceil(low * 1.3);
      mask.width = Math.max(1, textW + pad * 2);
      mask.height = textH + pad * 2;
      mctx.font = font;
      mctx.textBaseline = 'alphabetic';
      mctx.fillStyle = '#fff';
      let x = pad;
      const baseline = pad + Math.round(low * 1.0);
      chars.forEach((c, i) => {
        mctx.fillText(c, Math.round(x), baseline);
        x += widths[i] + tracking;
      });

      // 2) Snap to 1-bit
      const img = mctx.getImageData(0, 0, mask.width, mask.height);
      const cut = Math.round(threshold * 255);
      const W = mask.width;
      const on = new Uint8Array(W * mask.height);
      for (let p = 0; p < on.length; p++) on[p] = img.data[p * 4 + 3] >= cut ? 1 : 0;
      for (let p = 0; p < on.length; p++) {
        // Faux-bold: thicken every stroke one texel to the right
        const v = on[p] || (bold > 0 && p % W > 0 && on[p - 1]) ? 255 : 0;
        img.data[p * 4] = 255;
        img.data[p * 4 + 1] = 255;
        img.data[p * 4 + 2] = 255;
        img.data[p * 4 + 3] = v;
      }
      mctx.putImageData(img, 0, 0);

      // 3) Compose shadows + face from the mask, tinted
      const maxX = Math.max(0, ...shadows.map((s) => s.x));
      const maxY = Math.max(0, ...shadows.map((s) => s.y));
      canvas.width = mask.width + maxX;
      canvas.height = mask.height + maxY;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const tint = (fill: string) => {
        const t = document.createElement('canvas');
        t.width = mask.width;
        t.height = mask.height;
        const tctx = t.getContext('2d')!;
        tctx.drawImage(mask, 0, 0);
        tctx.globalCompositeOperation = 'source-in';
        tctx.fillStyle = fill;
        tctx.fillRect(0, 0, t.width, t.height);
        return t;
      };
      // Farthest shadow first, so nearer layers sit on top of it
      for (const s of [...shadows].reverse()) ctx.drawImage(tint(s.color), s.x, s.y);
      ctx.drawImage(tint(color), 0, 0);

      canvas.style.width = `${canvas.width * pixel}px`;
      canvas.style.height = `${canvas.height * pixel}px`;
      // Pull the padding back so the glyphs sit where plain text would
      canvas.style.margin = `${-pad * pixel}px 0 ${-pad * pixel}px ${-pad * pixel}px`;
    };

    draw();
    // Redraw once the font is actually available (first paint may use the fallback)
    document.fonts?.load(font).then(() => !cancelled && draw()).catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, size, pixel, color, shadowKey, tracking, threshold, bold]);

  return (
    <span className={className} style={{ display: 'inline-block', lineHeight: 0 }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ imageRendering: 'pixelated', display: 'block' }} />
      <span className="sr-only">{text}</span>
    </span>
  );
}
