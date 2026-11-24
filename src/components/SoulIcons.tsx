import { useId, type CSSProperties } from 'react';
import { ITEM_ARCHETYPE, SOUL_MAP, type SoulId } from '../game/souls';
import type { VmItemId } from '../game/types';

/*
 * Soul symbols, traced from the hand drawings as vector strokes so each one can assemble itself:
 *  - Caos: an ember runs along the spiral, scorching it (fire front, charred edge, flame spikes)
 *  - Controle: steel beams extend one by one, riveted at the joints, then energize blue
 *  - Ódio: the web of veins grows while the whole thing beats like a heart
 * Keyframes live in index.css (`sg-*`). With prefers-reduced-motion the final state shows at once.
 */

type Pt = [number, number];
const d = (pts: Pt[]) => `M${pts.map((p) => p.join(' ')).join(' L')}`;
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// ── Caos: one spiral stroke + flame spikes along its two upper edges
const CAOS_PATH: Pt[] = [
  [440, 70], [135, 295], [275, 575], [555, 585], [728, 398], [610, 185], [255, 300], [375, 490], [580, 375], [390, 320],
];
const CAOS_VIEW = '80 20 710 620';
const CAOS_DRAW = 1.9; // seconds for the fire to run the whole spiral

function cumulative(pts: Pt[]) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}
const CAOS_ACC = cumulative(CAOS_PATH);
const CAOS_LEN = CAOS_ACC[CAOS_ACC.length - 1];
/** Spikes on segment 0 (outer arm) and 5 (inner top), pointing outward; each knows when the fire reaches it. */
const CAOS_SPIKES = [0, 5].flatMap((seg) => {
  const [a, b] = [CAOS_PATH[seg], CAOS_PATH[seg + 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  return [0.14, 0.3, 0.46, 0.62, 0.78, 0.92].map((t, i) => {
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const h = i % 2 ? 30 : 20;
    return { x, y, x2: x + nx * h, y2: y + ny * h, at: ((CAOS_ACC[seg] + len * t) / CAOS_LEN) * CAOS_DRAW };
  });
});

// ── Controle: straight beams, in the order they get bolted on (each grows from its first point)
const CTRL_BEAMS: [Pt, Pt][] = [
  [[40, 100], [825, 118]],
  [[40, 100], [255, 550]],
  [[825, 118], [575, 560]],
  [[255, 550], [345, 350]],
  [[575, 560], [515, 345]],
  [[235, 150], [435, 20]],
  [[435, 20], [630, 180]],
  [[235, 150], [430, 480]],
  [[630, 180], [430, 480]],
];
const CTRL_VIEW = '0 -20 870 620';
const CTRL_BEAM_T = 0.32;
const CTRL_STAGGER = 0.17;
const CTRL_DONE = (CTRL_BEAMS.length - 1) * CTRL_STAGGER + CTRL_BEAM_T;
/** Joints: every distinct endpoint, riveted when the first beam touching it lands. */
const CTRL_RIVETS = (() => {
  const seen = new Map<string, { x: number; y: number; at: number }>();
  CTRL_BEAMS.forEach(([a, b], i) => {
    const start = i * CTRL_STAGGER;
    for (const [p, at] of [[a, start], [b, start + CTRL_BEAM_T]] as [Pt, number][]) {
      const k = p.join(',');
      if (!seen.has(k)) seen.set(k, { x: p[0], y: p[1], at });
    }
  });
  return [...seen.values()];
})();

// ── Ódio: a web of veins (it fades in with the heartbeat over ODIO_FORM seconds)
const ODIO_FORM = 3.5;
const ODIO_STROKES: Pt[][] = [
  [[60, 555], [550, 555]],
  [[545, 555], [545, 135]],
  [[105, 240], [410, 525], [545, 537]],
  [[205, 95], [525, 215]],
  [[190, 180], [400, 295], [525, 385]],
  [[310, 150], [205, 330], [110, 430], [150, 300]],
  [[430, 200], [310, 415]],
];
const ODIO_VIEW = '30 60 560 530';

/** Seconds until each symbol is whole (sounds sync to this). */
export const SOUL_FORM_TIME: Record<SoulId, number> = {
  caos: CAOS_DRAW + 0.3,
  controle: CTRL_DONE,
  odio: ODIO_FORM,
};

interface SoulGlyphProps {
  soul: SoulId;
  className?: string;
  /** Play the assembling animation on mount (change `key` to replay it). */
  animate?: boolean;
  /** Keep idle motion going afterwards (flicker / heartbeat). */
  live?: boolean;
  /** Extra glow (e.g. awakened soul). */
  glow?: boolean;
  /** Greyed out. */
  dim?: boolean;
  title?: string;
  /** Pixelate into this many blocks across (0 = smooth vector). */
  pixel?: number;
}

/**
 * Pixelation filter in the symbol's own units: sample one point per block, then grow it to fill
 * the block. Applied over the whole animated drawing, so it assembles in chunky pixels.
 */
function PixelFilter({ id, view, blocks }: { id: string; view: string; blocks: number }) {
  const [vx, vy, vw] = view.split(' ').map(Number);
  const b = vw / blocks;
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feFlood x={vx + b / 2 - 1} y={vy + b / 2 - 1} width={2} height={2} />
      <feComposite x={vx} y={vy} width={b} height={b} />
      <feTile result="grid" />
      <feComposite in="SourceGraphic" in2="grid" operator="in" />
      <feMorphology operator="dilate" radius={b / 2} />
    </filter>
  );
}

/** A soul's symbol, optionally assembling itself. */
export function SoulGlyph({ soul, className, animate = false, live = false, glow = false, dim = false, title, pixel = 36 }: SoulGlyphProps) {
  const uid = useId().replace(/:/g, '');
  const color = SOUL_MAP[soul].color;
  const a = animate ? '' : ' sg-still';
  const style: CSSProperties = {
    overflow: 'visible',
    filter: dim ? 'grayscale(0.55) brightness(0.7)' : glow ? `drop-shadow(0 0 6px ${color})` : undefined,
  };
  const label = title ?? SOUL_MAP[soul].name;
  const pxId = `px${uid}`;
  const pxOn = pixel > 0 ? `url(#${pxId})` : undefined;

  if (soul === 'caos') {
    const path = d(CAOS_PATH);
    return (
      <svg viewBox={CAOS_VIEW} className={className} style={style} role="img" aria-label={label}>
        {pixel > 0 && (
          <defs>
            <PixelFilter id={pxId} view={CAOS_VIEW} blocks={pixel} />
          </defs>
        )}
        <g filter={pxOn}>
        <defs>
          <filter id={`fire${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7">
              {live && <animate attributeName="seed" values="1;2;3;4;5;6;7;8" dur="0.6s" repeatCount="indefinite" />}
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="34" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id={`ember${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Fire front: flame-distorted orange that runs ahead, then smoulders */}
          {animate && (
            <path
              d={path}
              pathLength={1}
              stroke="#ff7a1a"
              strokeWidth={54}
              filter={`url(#fire${uid})`}
              className={`sg-draw sg-burn${live ? ' sg-smoulder' : ''}`}
              style={v({ '--d': `${CAOS_DRAW}s`, '--fade': `${CAOS_DRAW + 0.6}s` })}
            />
          )}
          {/* Scorched edge left behind */}
          <path d={path} pathLength={1} stroke="#2a0904" strokeWidth={40} className={`sg-draw${a}`} style={v({ '--d': `${CAOS_DRAW}s`, '--delay': '0.08s' })} />
          {/* The symbol itself, cooling in behind the fire */}
          <path d={path} pathLength={1} stroke={color} strokeWidth={28} className={`sg-draw${a}`} style={v({ '--d': `${CAOS_DRAW}s`, '--delay': '0.3s' })} />
          {/* Flame spikes catch as the fire passes */}
          {CAOS_SPIKES.map((s, i) => (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={s.x2}
              y2={s.y2}
              stroke={color}
              strokeWidth={16}
              className={`sg-spike${a}${live ? ' sg-flicker' : ''}`}
              style={v({ '--delay': `${s.at + 0.1}s`, transformOrigin: `${s.x}px ${s.y}px`, '--flick': `${0.35 + (i % 3) * 0.12}s` })}
            />
          ))}
          {/* Ember at the tip of the fire */}
          {animate && (
            <path d={path} pathLength={1} stroke="#fff1a8" strokeWidth={40} filter={`url(#ember${uid})`} className="sg-ember" style={v({ '--d': `${CAOS_DRAW}s` })} />
          )}
        </g>
        </g>
      </svg>
    );
  }

  if (soul === 'controle') {
    return (
      <svg viewBox={CTRL_VIEW} className={className} style={style} role="img" aria-label={label}>
        {pixel > 0 && (
          <defs>
            <PixelFilter id={pxId} view={CTRL_VIEW} blocks={pixel} />
          </defs>
        )}
        <g filter={pxOn}>
        <g fill="none" className={animate ? 'sg-clank' : undefined} style={v({ '--delay': `${CTRL_DONE}s` })}>
          {/* Steel beams sliding out */}
          {CTRL_BEAMS.map(([p, q], i) => (
            <line
              key={`m${i}`}
              x1={p[0]}
              y1={p[1]}
              x2={q[0]}
              y2={q[1]}
              pathLength={1}
              stroke="#7d8794"
              strokeWidth={36}
              strokeLinecap="square"
              className={`sg-draw sg-mech${a}`}
              style={v({ '--d': `${CTRL_BEAM_T}s`, '--delay': `${i * CTRL_STAGGER}s` })}
            />
          ))}
          {/* Energized core, once the frame is complete */}
          {CTRL_BEAMS.map(([p, q], i) => (
            <line
              key={`c${i}`}
              x1={p[0]}
              y1={p[1]}
              x2={q[0]}
              y2={q[1]}
              pathLength={1}
              stroke={color}
              strokeWidth={22}
              strokeLinecap="square"
              className={`sg-draw${a}`}
              style={v({ '--d': '0.35s', '--delay': `${CTRL_DONE + 0.05}s` })}
            />
          ))}
          {/* Steel highlight along each beam */}
          {CTRL_BEAMS.map(([p, q], i) => (
            <line
              key={`h${i}`}
              x1={p[0]}
              y1={p[1]}
              x2={q[0]}
              y2={q[1]}
              pathLength={1}
              stroke="#e8eef5"
              strokeOpacity={0.55}
              strokeWidth={5}
              className={`sg-draw sg-mech${a}`}
              style={v({ '--d': `${CTRL_BEAM_T}s`, '--delay': `${i * CTRL_STAGGER}s` })}
            />
          ))}
          {/* Rivets at the joints */}
          {CTRL_RIVETS.map((r, i) => (
            <circle
              key={`r${i}`}
              cx={r.x}
              cy={r.y}
              r={13}
              fill="#c9d1db"
              stroke="#2b3138"
              strokeWidth={4}
              className={`sg-pop${a}`}
              style={v({ '--delay': `${r.at}s`, transformOrigin: `${r.x}px ${r.y}px` })}
            />
          ))}
        </g>
        </g>
      </svg>
    );
  }

  // Ódio
  return (
    <svg viewBox={ODIO_VIEW} className={className} style={style} role="img" aria-label={label}>
        {pixel > 0 && (
          <defs>
            <PixelFilter id={pxId} view={ODIO_VIEW} blocks={pixel} />
          </defs>
        )}
        <g filter={pxOn}>
      <defs>
        <filter id={`blood${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? `sg-heart-in${live ? ' sg-beat' : ''}` : live ? 'sg-beat' : undefined}
        style={v({ transformBox: 'fill-box', transformOrigin: 'center', '--form': `${ODIO_FORM}s` })}
      >
        {/* Pulsing blood glow behind the veins */}
        {ODIO_STROKES.map((pts, i) => (
          <path
            key={`g${i}`}
            d={d(pts)}
            pathLength={1}
            stroke="#ff1238"
            strokeWidth={46}
            filter={`url(#blood${uid})`}
            className={`sg-draw${a}${live ? ' sg-throb' : ''}`}
            style={v({ '--d': `${ODIO_FORM * 0.45}s`, '--delay': `${ODIO_FORM * (0.08 + i * 0.06)}s`, '--form': `${ODIO_FORM}s`, opacity: 0.5 })}
          />
        ))}
        {ODIO_STROKES.map((pts, i) => (
          <path
            key={`s${i}`}
            d={d(pts)}
            pathLength={1}
            stroke={color}
            strokeWidth={26}
            className={`sg-draw${a}`}
            style={v({ '--d': `${ODIO_FORM * 0.45}s`, '--e': 'cubic-bezier(.3,0,.2,1)', '--delay': `${ODIO_FORM * (0.08 + i * 0.06)}s` })}
          />
        ))}
      </g>
      </g>
    </svg>
  );
}

/** Tiny archetype mark pinned to an item card's corner (nothing for neutral items). */
export function ItemArchetypeMark({ id, className = 'absolute top-1 right-1 w-4 h-4' }: { id: VmItemId; className?: string }) {
  const soul = ITEM_ARCHETYPE[id];
  if (!soul) return null;
  return (
    <span className={`${className} pointer-events-none`} title={SOUL_MAP[soul].name}>
      <SoulGlyph soul={soul} className="w-full h-full" pixel={0} />
    </span>
  );
}
