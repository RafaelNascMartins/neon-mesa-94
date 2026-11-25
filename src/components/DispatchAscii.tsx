import { useEffect, useRef, useState } from 'react';

/**
 * The boot terminal's dispatch: across the whole bottom of the screen, the Mustang — drawn in
 * code (its body filled with its own source, scrolling) — drives a text road up to the Data
 * Tree, which stands whole on the right: a huge canopy, branches, a trunk with glowing veins,
 * roots, and the round doorway at its foot lighting up as the car arrives. When it pulls up,
 * `onDone` (the scene changes to the real opening).
 *
 * The grid is fixed (W × H cells); the font size is worked out from the space it gets, so it
 * always spans the full width.
 */

const W = 150;
const H = 24;
const ROAD = H - 1;
const GROUND = H - 2;

// the Tree
const TX = W - 27; // trunk centre
const TRUNK_HALF = 6;
const CANOPY = { cx: TX, cy: 5, rx: 27, ry: 6 };
const DOOR = { cx: TX, top: GROUND - 5, half: 5 };

// the car ('#' cells are filled with code; '.' is empty; '@' wheels)
// Small on purpose: next to the Tree it's a toy
const CAR = [
  '....______.....',
  '.__/##|##\\____.',
  '|#############>',
  "'-(@)-----(@)-'",
];
const CAR_W = CAR[0].length;
const CODE = 'mustang.service{V8:5.0L;floor_it();target="/DataTree";antivirus.exe;dispatch(0x5EED);while(alive)drive();}';

/** Seconds until it pulls up at the door (and the scene changes). */
const DRIVE = 3.4;
/** Where its nose ends up: a few cells short of the doorway. */
const STOP_X = DOOR.cx - DOOR.half - 5;

type Cell = { ch: string; c?: string };
const BARK = '#7a5a46';
const BARK_DARK = '#4e382c';
const LEAF = ['#5a1a12', '#7a2a18', '#3a1410', '#8a3a1c'];
const EMBER = '#ff7a2a';
const ROAD_C = '#5a554c';

// stable per-cell noise
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h & 0xffff) / 0xffff;
};

export function DispatchAscii({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const [font, setFont] = useState(10);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef(performance.now());
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = (performance.now() - start.current) / 1000;
      setT(now);
      if (now > DRIVE + 0.35 && !done.current) {
        done.current = true;
        onDoneRef.current();
      }
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  // fit the grid: full width, at most ~45% of the screen tall
  useEffect(() => {
    const fit = () => {
      const w = box.current?.clientWidth ?? window.innerWidth;
      const byW = w / (W * 0.6);
      const byH = (window.innerHeight * 0.45) / H;
      setFont(Math.max(5, Math.floor(Math.min(byW, byH) * 10) / 10));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const grid: Cell[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ch: ' ' })));
  const put = (x: number, y: number, ch: string, c?: string) => {
    x = Math.round(x);
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = { ch, c };
  };
  const u = Math.min(1, t / DRIVE);

  // sky: a few dim stars; far mesas on the left horizon
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash(i, 7) * (W - 60));
    const y = Math.floor(hash(i, 11) * 12);
    if (hash(i, 3) > 0.5) put(x, y, hash(i, 5) > 0.8 ? '+' : '.', '#3a3a44');
  }
  for (let x = 0; x < W - 60; x++) {
    const h = Math.floor(2 + Math.sin(x * 0.11) * 1.5 + Math.sin(x * 0.37) * 0.8 + (hash(x, 1) > 0.9 ? 1 : 0));
    for (let y = GROUND - h; y < GROUND; y++) put(x, y, y === GROUND - h ? '_' : ':', '#2a2622');
  }

  // road and ground
  for (let x = 0; x < W; x++) {
    put(x, GROUND, hash(x, 9) > 0.85 ? ',' : '_', '#3a3430');
    put(x, ROAD, x % 6 < 3 ? '=' : ' ', ROAD_C);
  }

  // ── the Tree
  // canopy: a ragged, burnt crown
  for (let y = 0; y <= CANOPY.cy + CANOPY.ry + 2; y++) {
    for (let x = CANOPY.cx - CANOPY.rx - 3; x <= CANOPY.cx + CANOPY.rx + 3; x++) {
      const dx = (x - CANOPY.cx) / CANOPY.rx;
      const dy = (y - CANOPY.cy) / CANOPY.ry;
      const edge = 1 + (hash(x, y) - 0.5) * 0.35 + Math.sin(x * 0.7) * 0.08;
      const d = dx * dx + dy * dy;
      if (d > edge) continue;
      const r = hash(x * 3, y * 5);
      const ch = r < 0.25 ? '@' : r < 0.5 ? '%' : r < 0.7 ? '&' : r < 0.85 ? '#' : '*';
      const ember = r > 0.965;
      put(x, y, ember ? '*' : ch, ember ? EMBER : LEAF[Math.floor(hash(x, y * 7) * LEAF.length)]);
    }
  }
  // branches reaching up into it
  const branch = (x0: number, y0: number, dir: number, len: number) => {
    for (let k = 0; k < len; k++) {
      const x = x0 + dir * k * 1.6;
      const y = y0 - k;
      put(x, y, dir < 0 ? '\\' : '/', BARK);
      put(x + dir, y, dir < 0 ? '\\' : '/', BARK_DARK);
    }
  };
  branch(TX - TRUNK_HALF, 11, -1, 7);
  branch(TX + TRUNK_HALF, 11, 1, 7);
  branch(TX - 2, 9, -1, 5);
  branch(TX + 2, 9, 1, 5);
  // trunk (flaring toward the foot) with bark and glowing veins
  for (let y = 8; y < GROUND; y++) {
    const flare = y > GROUND - 5 ? (y - (GROUND - 5)) * 1.6 : 0;
    const half = TRUNK_HALF + flare;
    for (let x = Math.round(TX - half); x <= Math.round(TX + half); x++) {
      const edgeL = x === Math.round(TX - half);
      const edgeR = x === Math.round(TX + half);
      const vein = (x === TX - 3 || x === TX + 4) && (y + Math.floor(t * 10)) % 5 === 0;
      const k = hash(x, y * 3);
      const ch = edgeL ? '(' : edgeR ? ')' : vein ? '*' : k < 0.3 ? '|' : k < 0.55 ? ':' : k < 0.7 ? '(' : k < 0.85 ? ')' : '|';
      put(x, y, ch, vein ? EMBER : k < 0.5 ? BARK : BARK_DARK);
    }
  }
  // roots spreading out over the ground
  for (let k = 0; k < 9; k++) {
    put(TX - TRUNK_HALF - 9 - k, GROUND - 1 + (k > 5 ? 1 : 0), k > 5 ? '_' : '/', BARK_DARK);
    put(TX + TRUNK_HALF + 9 + k, GROUND - 1 + (k > 5 ? 1 : 0), k > 5 ? '_' : '\\', BARK_DARK);
  }
  // the round doorway: an iron rim, glowing inside more and more as the car arrives
  for (let y = DOOR.top; y < GROUND; y++) {
    const dy = (y - (DOOR.top + 3)) / 3.2;
    const span = Math.round(Math.sqrt(Math.max(0, 1 - dy * dy)) * DOOR.half);
    for (let x = DOOR.cx - span; x <= DOOR.cx + span; x++) {
      const rim = x === DOOR.cx - span || x === DOOR.cx + span || y === DOOR.top;
      if (rim) {
        put(x, y, y === DOOR.top ? '=' : 'O', '#9a9aa0');
        continue;
      }
      const lvl = 0.25 + u * 0.85 - Math.abs(x - DOOR.cx) / 9 + (y - DOOR.top) / 14;
      put(x, y, lvl > 0.85 ? '▓' : lvl > 0.55 ? '▒' : '░', EMBER);
    }
  }

  // ── the Mustang: in from the left, easing off as it pulls up at the door
  const ease = 1 - Math.pow(1 - u, 2.2);
  const nose = -2 + ease * (STOP_X + 2);
  const carX = Math.round(nose - CAR_W);
  const carY = ROAD - CAR.length;
  const scroll = Math.floor(t * 22);
  const wheel = ['@', 'O', '0', 'o'][Math.floor(t * 14 * (1 - u * 0.8)) % 4];
  for (let r = 0; r < CAR.length; r++) {
    for (let i = 0; i < CAR_W; i++) {
      const m = CAR[r][i];
      if (m === '.') continue;
      if (m === '#') put(carX + i, carY + r, CODE[(i + r * 7 + scroll) % CODE.length], '#ff3b3b');
      else if (m === '@') put(carX + i, carY + r, wheel, '#c8c4bc');
      else if (m === '>') put(carX + i, carY + r, '>', '#ffe08a');
      else put(carX + i, carY + r, m, '#e9e4d8');
    }
  }
  // headlight beam ahead of it
  for (let k = 1; k <= 6; k++) {
    if (hash(k, Math.floor(t * 8)) > 0.75 - k * 0.04) continue;
    put(carX + CAR_W + k, carY + 2, k < 3 ? '=' : '-', k < 4 ? '#ffe08a' : '#8a7a4a');
  }
  // dust thrown up behind
  if (u < 0.97) {
    for (let k = 1; k <= 8; k++) {
      if (hash(k, scroll) > 0.6) put(carX - k * 2, carY + 3, k < 4 ? '~' : '.', '#6a645a');
    }
  }

  return (
    <div ref={box} className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-10" aria-hidden>
      <div className="whitespace-pre" style={{ fontSize: `${font}px`, lineHeight: 1.0, letterSpacing: 0 }}>
        {grid.map((row, y) => {
          const spans: { text: string; c?: string }[] = [];
          for (const cell of row) {
            const last = spans[spans.length - 1];
            if (last && last.c === cell.c) last.text += cell.ch;
            else spans.push({ text: cell.ch, c: cell.c });
          }
          return (
            <div key={y}>
              {spans.map((s, i) => (
                <span key={i} style={{ color: s.c }}>
                  {s.text}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
