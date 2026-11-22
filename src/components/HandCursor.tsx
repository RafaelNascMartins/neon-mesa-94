import { useEffect, useRef } from 'react';

/**
 * Menus get a little pixel-art glove instead of the arrow: it trails the mouse with a soft
 * spring, bobs while idle, leans in and wiggles over anything clickable, and squashes on click.
 * Hidden during gameplay (the aim reticle takes over) and on touch screens.
 */

const HAND = [
  '.....KK.........',
  '....KWWK........',
  '....KWWK........',
  '....KWWK........',
  '....KWWKKK......',
  '....KWWKWWKKK...',
  '.KK.KWWKWWKWWKK.',
  'KWWKKWWKWWKWWKWK',
  'KWWWKWWWWWWWWKWK',
  '.KWWWWWWWWWWWWWK',
  '..KWWWWWWWWWWWWK',
  '..KWWWWWWWWWWWK.',
  '...KWWWWWWWWWWK.',
  '....KWWWWWWWWK..',
  '....KRRRRRRRRK..',
  '....KKKKKKKKKK..',
];
// Pressed: the index finger folds down
const PRESS = HAND.map((row, y) => (y < 4 ? '................' : row));

function sprite(rows: string[]): string {
  const S = 3;
  const c = document.createElement('canvas');
  c.width = 16 * S;
  c.height = 16 * S;
  const x = c.getContext('2d')!;
  const col: Record<string, string> = { K: '#0a0a0c', W: '#f4ead8', R: '#e0283a' };
  rows.forEach((row, y) =>
    [...row].forEach((ch, i) => {
      if (!col[ch]) return;
      x.fillStyle = ch === 'W' && i > 9 ? '#d8cfbc' : col[ch]; // shade the far side of the glove
      x.fillRect(i * S, y * S, S, S);
    })
  );
  return c.toDataURL('image/png');
}

const CLICKABLE = 'button:not(:disabled), a, [role="tab"], [role="button"], input, select, label, .px-menu-item';

export function HandCursor() {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const el = ref.current;
    if (!el) return;
    const normal = sprite(HAND);
    const press = sprite(PRESS);
    el.src = normal;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tx = -100;
    let ty = -100;
    let x = tx;
    let y = ty;
    let hover = false;
    let down = false;
    let squash = 0;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      hover = !!(e.target as Element | null)?.closest?.(CLICKABLE);
    };
    const onDown = () => {
      down = true;
      squash = 1;
      el.src = press;
    };
    const onUp = () => {
      down = false;
      el.src = normal;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const menu = document.body.dataset.state !== 'playing';
      document.documentElement.classList.toggle('hand-cursor', menu);
      el.style.display = menu ? 'block' : 'none';
      if (menu) {
        const k = reduced ? 1 : 0.35;
        x += (tx - x) * k;
        y += (ty - y) * k;
        squash = Math.max(0, squash - 0.12);
        const bob = reduced ? 0 : hover ? Math.sin(t * 14) * 1.2 : Math.sin(t * 3) * 1;
        const tilt = reduced ? 0 : hover ? -12 + Math.sin(t * 14) * 6 : Math.sin(t * 2) * 3;
        const s = (hover ? 1.12 : 1) * (down ? 0.88 : 1) - squash * 0.06;
        // The fingertip is the hotspot (24 px glove: ≈ 8 px in, 1 down)
        el.style.transform = `translate(${x - 8}px, ${y - 1 + bob}px) rotate(${tilt}deg) scale(${s}, ${s * (1 - squash * 0.08)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.documentElement.classList.remove('hand-cursor');
    };
  }, []);

  return (
    <img
      ref={ref}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 24,
        height: 24,
        zIndex: 100,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
        transformOrigin: '8px 1px',
        filter: 'drop-shadow(1px 1px 0 rgba(0,0,0,0.45))',
        display: 'none',
      }}
    />
  );
}
