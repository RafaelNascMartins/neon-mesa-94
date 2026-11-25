import { useEffect, useRef, useState } from 'react';

/**
 * A small readout under `./run.sh` in the boot terminal: the Mustang, drawn in code (its body
 * filled with its own source, scrolling), driving a text road toward the Data Tree — whose trunk
 * runs off the top of the strip. Once it's getting close, `onDone` (the scene changes to the
 * real opening).
 */

const W = 46;
const H = 7;
const ROAD = H - 1;
const TX = W - 11; // trunk's left face
const DOOR_L = TX + 1;
const DOOR_R = TX + 6;
const DOOR_TOP = ROAD - 4;

// '#' cells are filled with code; everything else is drawn as is ('.' = empty)
const CAR = [
  '....______.....',
  '.__/##|##\\____.',
  '|#############>',
  "'-(@)-----(@)-'",
];
const CAR_W = CAR[0].length;
const CODE = 'mustang.service{V8:5.0L;floor_it();target="/DataTree";antivirus.exe;dispatch(0x5EED);}';

/** Seconds until it's close to the door (and the scene changes). */
const DRIVE = 2.8;
/** Where its nose ends up when the scene changes: a few cells short of the door. */
const STOP_X = DOOR_L - 4;

type Cell = { ch: string; c?: string };
const BARK = '#7a5a46';

export function DispatchAscii({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const start = useRef(performance.now());
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = (performance.now() - start.current) / 1000;
      setT(now);
      if (now > DRIVE && !done.current) {
        done.current = true;
        onDoneRef.current();
      }
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  const grid: Cell[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ch: ' ' })));
  const put = (x: number, y: number, ch: string, c?: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = { ch, c };
  };

  // the road
  for (let x = 0; x < W; x++) put(x, ROAD, x % 4 === 0 ? ' ' : '=', '#5a554c');

  // the Tree: its trunk runs off the top; the doorway at its foot glows brighter as it nears
  const u = Math.min(1, t / DRIVE);
  for (let y = 0; y < ROAD; y++) {
    const flare = y === ROAD - 1 ? 2 : 0;
    for (let x = TX - flare; x < W; x++) {
      if (x >= DOOR_L && x <= DOOR_R && y >= DOOR_TOP) continue;
      if (x < TX) {
        put(x, y, x === TX - flare ? '/' : '_', BARK);
        continue;
      }
      const k = (x * 7 + y * 3) % 11;
      const vein = x === TX + 8 && (y + Math.floor(t * 8)) % 6 === 0;
      put(x, y, vein ? '*' : x === TX ? '|' : k === 0 ? ')' : k === 5 ? '(' : (x + y) % 4 === 0 ? '|' : ':', vein ? '#ff7a2a' : BARK);
    }
  }
  for (let y = DOOR_TOP; y < ROAD; y++) {
    for (let x = DOOR_L; x <= DOOR_R; x++) {
      const edge = x === DOOR_L || x === DOOR_R;
      if (y === DOOR_TOP) {
        put(x, y, edge ? ' ' : '_', BARK);
        continue;
      }
      const lvl = 0.3 + u * 0.8 - Math.abs(x - (DOOR_L + DOOR_R) / 2) / 5;
      put(x, y, edge ? '|' : lvl > 0.8 ? '▓' : lvl > 0.5 ? '▒' : '░', edge ? BARK : '#ff7a2a');
    }
  }

  // the Mustang: in from the left, flooring it toward the door
  const nose = -1 + u * u * (STOP_X + 1);
  const carX = Math.round(nose - CAR_W);
  const carY = ROAD - CAR.length;
  const scroll = Math.floor(t * 18);
  for (let r = 0; r < CAR.length; r++) {
    for (let i = 0; i < CAR_W; i++) {
      const m = CAR[r][i];
      if (m === '.') continue;
      if (m === '#') put(carX + i, carY + r, CODE[(i + r * 7 + scroll) % CODE.length], '#ff3b3b');
      else put(carX + i, carY + r, m, '#e9e4d8');
    }
  }
  if (u > 0.2) {
    for (let k = 1; k <= 4; k++) put(carX - k * 2, carY + 2, '-', '#5a554c');
    put(carX - 2 - (scroll % 3), ROAD - 1, '.', '#8f897d');
  }

  return (
    <div className="mt-2 whitespace-pre leading-[1.05] text-[12px] sm:text-[14px]" aria-hidden>
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
  );
}
