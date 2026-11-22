import { memo, type CSSProperties } from 'react';
import { itemPixels } from '../game/itemSprites';
import type { VmItemId, WeaponId } from '../game/types';

/**
 * Pixel sprites are painted once to a canvas and reused as a cached data URL in an <img>.
 * (Hundreds of SVG <rect>s per icon, re-rendered by the HUD every tick, were a big CPU cost.)
 */
const spriteUrlCache = new Map<string, string>();
type Cell = { x: number; y: number; w: number; fill: string; alpha?: number };
function spriteUrl(key: string, vb: [number, number, number, number], cells: () => Cell[]): string {
  const hit = spriteUrlCache.get(key);
  if (hit) return hit;
  const S = vb[2] > 14 ? 5 : 8;
  const c = document.createElement('canvas');
  c.width = Math.round(vb[2] * S);
  c.height = Math.round(vb[3] * S);
  const ctx = c.getContext('2d')!;
  for (const cell of cells()) {
    ctx.globalAlpha = cell.alpha ?? 1;
    ctx.fillStyle = cell.fill;
    ctx.fillRect(Math.round((cell.x - vb[0]) * S), Math.round((cell.y - vb[1]) * S), Math.round(cell.w * S), S);
  }
  const url = c.toDataURL('image/png');
  spriteUrlCache.set(key, url);
  return url;
}

function PixelImg({ src, className, style }: { src: string; className: string; style?: CSSProperties }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={'object-contain ' + className}
      style={{ imageRendering: 'pixelated', ...style }}
    />
  );
}

/** Gungeon-style item sprite (10×10 pixel art with auto outline). */
export const ItemIcon = memo(function ItemIcon({ id, className = 'w-12 h-12' }: { id: VmItemId; className?: string }) {
  const src = spriteUrl('item:' + id, [-1, -1, 18, 18], () => itemPixels(id).map(([x, y, fill]) => ({ x, y, w: 1, fill })));
  return <PixelImg src={src} className={className} />;
});

/** Title lockup: a terminal prompt typing `cd /DataTree` next to a binary tree that grows downward. */
export function DataTreeEmblem() {
  // Binary tree glyph: root at the top, branching down (the game is a descent)
  const nodes: [number, number][] = [
    [52, 22],
    [30, 58],
    [74, 58],
    [18, 94],
    [42, 94],
    [64, 94],
    [86, 94],
    [42, 128],
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [1, 4],
    [2, 5],
    [2, 6],
    [4, 7],
  ];
  return (
    <svg
      viewBox="0 0 420 150"
      className="w-full max-w-[380px] h-auto drop-shadow-[4px_4px_0px_#050507]"
      aria-label="cd /DataTree"
      role="img"
      shapeRendering="crispEdges"
    >
      {edges.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a][0]}
          y1={nodes[a][1]}
          x2={nodes[b][0]}
          y2={nodes[b][1]}
          stroke="#4b4f58"
          strokeWidth="3"
        />
      ))}
      {nodes.map(([x, y], i) => (
        <rect
          key={i}
          x={x - 6}
          y={y - 6}
          width="12"
          height="12"
          fill={i === 7 ? '#ff2a3c' : '#e9e4d8'}
          stroke="#050507"
          strokeWidth="2.5"
        />
      ))}

      <text x="118" y="54" fill="#8f897d" fontFamily="JetBrains Mono, monospace" fontWeight="700" fontSize="15" letterSpacing="2">
        root@wasteland:~$
      </text>
      <text
        x="116"
        y="104"
        stroke="#050507"
        strokeWidth="6"
        paintOrder="stroke fill"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="800"
        fontSize="40"
        letterSpacing="-1"
      >
        <tspan fill="#e9e4d8">cd </tspan>
        <tspan fill="#ff2a3c">/DataTree</tspan>
      </text>
      <rect x="118" y="114" width="20" height="5" fill="#e9e4d8">
        <animate attributeName="opacity" values="1;1;0;0" dur="1s" repeatCount="indefinite" />
      </rect>
      <rect x="116" y="130" width="290" height="3" fill="#ff2a3c" />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Pixel-art weapon sprites
 *
 * Every weapon is authored as a 32x16 character grid (one char = one pixel) and rendered as
 * crisp SVG rects. A 1px dark outline is generated automatically around the silhouette, so all
 * icons share the same scale, facing (muzzle → right), outline weight and material palette.
 * Only the `a`/`A` pixels take the weapon's own accent colour, so the set reads as one family.
 * Each weapon gets its own silhouette and uses the full height (drum, bell, keycap, diagonal blade...).
 * ------------------------------------------------------------------------------------------------ */

const SPRITE_W = 32;
const SPRITE_H = 16;
const OUTLINE_HEX = '#050507';

// Clean shared palette; `a` and `A` are resolved per weapon.
const BASE_PALETTE: Record<string, string> = {
  M: '#eef0f4', // chrome highlight
  m: '#9aa0ac', // steel
  d: '#555a66', // gunmetal
  k: '#2a2c34', // dark steel
  W: '#c07a44', // wood highlight
  w: '#7e4628', // wood
  s: '#d6dae2', // blade
  c: '#26262c', // rubber grip
  b: '#efebe2', // white shell / bone
  r: '#d8a640', // brass
  x: '#6a7a48', // olive
  y: '#f0bc22', // hazard yellow
  X: '#ff2a1f', // red glow
};

const WEAPON_SPRITES: Record<WeaponId, string[]> = {
  // Revolver: walnut grip, fluted cylinder, long chrome barrel with a red sight line
  pistol: grid([
    '',
    '',
    '',
    '......kk',
    '.....kdddkkkkkkkkkkkkkkkkkkkkkk',
    '.....kdMMMMMMMMMMMMMMMMMMMMMMMMMk',
    '....kddmmmmmmmmmmmmmmmmmmmmmmmmk',
    '....kdmaAamdXXXXXXXXXXXXXXXXXXXk',
    '....kdmAaAmdkkkkkkkkkkkkkkkkkk',
    '....kddmmmdkk.k',
    '...kWWkddddk.kk',
    '...kWwwkkkk.k',
    '..kWwwwk',
    '..kWwwk',
    '.kWwwwk',
    '.kkkkk',
  ]),
  // Pump shotgun: long walnut stock, receiver with a red shell window, ribbed pump
  shotgun: grid([
    '',
    '',
    '',
    '',
    '..........kkkkkkkkkkkkkkkkkkkkkkk',
    '.WWW......kdMMMMMMMMMMMMMMMMMMMMk',
    'WWwwWWWWWkkddXXddmmmmmmmmmmmmmmmk',
    'wwwwwwwwwwkddXXddkkkkkkkkkkkkkkk',
    '.wwwwwwwwwkdddddkWWwWWwWWwkdddk',
    '..wwww..kwwkkkkkkwWwWWwWWwkkkk',
    '........kwwk.....kkkkkkkkk',
    '.........kwwk',
    '..........kk',
  ]),
  // Plasma: rounded white shell, three glowing coil rings, battery cell
  plasma: grid([
    '',
    '',
    '..............bbbbbbbbbb',
    '.............bMMMMMMMMMMb',
    '...kk.......bbbbbbbbbbbaA.aA.aA',
    '..kddkkkkkkbbbbbbbbbbbbAaAAaAAak',
    '..kdddddddbbbbbbbbbbbbbAaAAaAAak',
    '...kkkkkkkbbbbbbbbbbbbbaA.aA.aA',
    '..........kbbbbaAbbbbbbbb',
    '...........kcckaAk',
    '...........kcck.kk',
    '..........kccck',
    '..........kcck',
    '..........kkk',
  ]),
  // Railgun: two open chrome rails with green current between, capacitor drum, scope
  railgun: grid([
    '',
    '',
    '.........kkkkk',
    '.........kdddk',
    '.............MMMMMMMMMMMMMMMMMMM',
    'kkkkkkkkkkdAaAdmmmmmmmmmmmmmmmmm',
    'kdddddddddAaAadAAAAAAAAAAAAAAAAa',
    'kkddkkkkkkdAaAdaaaaaaaaaaaaaaaaa',
    '..kk...kcckaAadmmmmmmmmmmmmmmmmm',
    '.......kcckkkkkMMMMMMMMMMMMMMMMM',
    '.......kcck',
    '......kccck',
    '......kcck',
    '......kkk',
  ]),
  // Rocket launcher: fat olive tube, yellow bands, red warhead peeking from the front
  rocket: grid([
    '',
    '',
    '...kkkkkkkkkkkkkkkkkkkkkkkkkk',
    '..kxxxxyxxxxxxxxxxxxxyxxxxxxxk',
    '.kxMMMyMMMMMMMMMMMMMyMMMMMMMMkX',
    'kkxxxxyxxxxxxxxxxxxxyxxxxxxxxkXX',
    'kkxxxxyxxxxxxxxxxxxxyxxxxxxxxkXX',
    '.kxxxxyxxxxxxxxxxxxxyxxxxxxxxkX',
    '..kxxxyxxxxxxxxxxxxxyxxxxxxxk',
    '...kkkkkkkkkkkkkkkkkkkkkkkkk',
    '.........kcck.....kdk',
    '.........kcck.....kdk',
    '........kccck.....kkk',
    '........kcck',
    '........kkk',
  ]),
  // Katana: long gently curved blade with a red edge, round brass guard, wrapped hilt (diagonal)
  katana: grid([
    '..............................Ms',
    '...........................MMss',
    '........................MMMssX',
    '.....................MMMsssXX',
    '..................MMMsssXXX',
    '...............MMMsssXXX',
    '............MMMsssXXX',
    '..........rMsssXXX',
    '.........rrrsXX',
    '........rrrrr',
    '.......kbckr',
    '......kcbck',
    '.....kbckb',
    '....kcbck',
    '...rrbck',
    '...rrk',
  ]),
  // Sledgehammer: big round steel head with red-rimmed faces, long wooden handle
  hammer: grid([
    '',
    '.......................kkkkk',
    '.....................XkmmmmmkX',
    '....................XkMMMMMMMkX',
    '....................XkmmmmmmmkX',
    'cccc.WWWWWWWWWWWWWWWdkmmmmmmmkdX',
    'ccccwwwwwwwwwwwwwwwwdkmmmmmmmkdX',
    'cccc.wwwwwwwwwwwwwwwdkdddddddkdX',
    '....................XkdddddddkX',
    '....................XkdddddddkX',
    '.....................XkdddddkX',
    '.......................kkkkk',
  ]),
  // Nail gun: chunky yellow body, black nose, nail strip slanting under, rubber handle
  nailgun: grid([
    '',
    '',
    '.......kkkkkkkkkkkkkk',
    '......kyyyyyyyyyyyyyyk',
    '......kyMMMMMMMMMMMMyk',
    '......kyyyyyyyyyyyyyykkkkkkk',
    '......kyyyyyyyyyyyyyykddddddkX',
    '......kyyyyyyyyyyyyyykddddddkX',
    '......kyyyyyyyyyyyyyykkkkkkk',
    '.......kcckkkmmmmmmmk',
    '.......kcck.kmmmmmmk',
    '.......kcck..kmmmmk',
    '......kccck...kmmk',
    '......kcck',
    '......kkk',
  ]),
  // Speargun: slim wooden barrel, red rubber bands, chrome shaft, single clean arrowhead, reel
  harpoon: grid([
    '',
    '',
    '',
    '..........................MMk',
    '.........................MMMMk',
    '....kkkkkkkkkkkkkkkkkkkkMMMMMMk',
    'WWWWWWWWWWXXXXXXXXXXmmmmmmmmMMMMk',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwkMMk',
    '.wwwwwwwkkkkXXXXXXXXkkkkkkk.Mk',
    '......kcck.krrk',
    '......kcck.krrk',
    '.....kccck..kk',
    '.....kcck',
    '.....kkk',
  ]),
  // fork(): stubby launcher with a big revolving drum of green bomblets
  forkbomb: grid([
    '',
    '..........kkkkkkkk',
    '.........kddddddddk',
    '........kdaAkdaAkdk',
    '........kdAakdAakdkkkkkkkkkk',
    '........kddddddddddddddddddkAa',
    '......kkkdaAkdaAkdmmmmmmmmmkaA',
    '......kddkAakdAakddddddddddkAa',
    '......kddddddddddkkkkkkkkkk',
    '.......kkkdaAkdaAk',
    '.......kcckAakdAak',
    '.......kcckddddddk',
    '......kccckkkkkkk',
    '......kcck',
    '......kkk',
  ]),
  // Coice: two stubby sawn-off barrels, brass hinge, swept walnut grip
  coice: grid([
    '',
    '',
    '',
    '',
    '..........kkkkkkkkkkkkkkkk',
    '.........kdMMMMMMMMMMMMMMMkX',
    '.......kkkdmmmmmmmmmmmmmmmkX',
    '......kWWkrkkkkkkkkkkkkkkkk',
    '.....kWwwkrdMMMMMMMMMMMMMMMkX',
    '....kWwwwkddmmmmmmmmmmmmmmmkX',
    '...kWwwwk.kkkWWWWWWkkkkkkkk',
    '..kWwwwk.....kkkkkk',
    '.kWwwwk',
    '.kwwwk',
    '..kkk',
  ]),
  // Juiz: a hand cannon — oversized brass drum, thick slab barrel with glowing vents, bone grip
  juiz: grid([
    '',
    '',
    '..........kkkkkkkkkkkkkkkkkkkkkk',
    '.........kMMMMMMMMMMMMMMMMMMMMMk',
    '.....kkkkkdmmXmmXmmXmmXmmmmmmmmk',
    '....krrrrkdmmmmmmmmmmmmmmmmmmmmk',
    '...krMrkrkddddddddddddddddddddk',
    '...krrkrrkkkkkkkkkkkkkkkkkkkkk',
    '...krkrrrkdk.k',
    '....krrrrkdkk',
    '....kbbkkddk',
    '...kbbbbkk',
    '...kbbbk',
    '..kbbbbk',
    '..kbbbk',
    '..kkkk',
  ]),
  // Canhão de Faces: round dark breech with a red eye, ringed with tiny white masks, bell mouth
  faces: grid([
    '',
    '.........................kkkk',
    '........................kddddkX',
    '......kkkk......bb.....kdddddkX',
    '....kkddddkk...bkkb...kddddddkX',
    '...kddddddddkkkbbbbkkkdddddddkX',
    '...kdXXdddddddmmmmmmmmmdddddddkX',
    '...kdXXdddddddddddddddddddddddkX',
    '...kddddddddkkkbbbbkkkdddddddkX',
    '....kkddddkk...bkkb...kddddddkX',
    '......kkcck.....bb.....kdddddkX',
    '.......kcck.............kddddkX',
    '......kccck..............kkkk',
    '......kcck',
    '......kkk',
  ]),
  // rm -rf: sleek white wand, big red DELETE keycap on top, wide flat slot nozzle
  rmrf: grid([
    '..........kkkkkkkk',
    '.........kXXXXXXXXk',
    '.........kXMMMMMMXk',
    '.........kXXXXXXXXk',
    '...........kkddkk..........kkkk',
    '......kkkkkkkkkkkkkkkkkkk..kkdd',
    '.....kbMMMMMMMMMMMMMMMMMbkkkdXX',
    '....kbbbbbbbbbbbbbbbbbbbbbbddXX',
    '....kXXXXXXXXXXXXXXXXXXXXbbddXX',
    '.....kbbbbbbbbbbbbbbbbbbbkkkdXX',
    '......kbbkkkkkkkkkkkkkkkk..kkdd',
    '......kbbk.................kkkk',
    '.....kbbbk',
    '.....kbbk',
    '.....kkk',
  ]),
  // Dinamite: three red sticks bound with brass wire, a lit fuse fizzing at the top
  dinamite: grid([
    '..........................yXy',
    '.........................XyX',
    '........................k.y',
    '.......................k',
    '...kkkkkkkkkkkkkkkkkkkk',
    '..kAAAAAAAAAAAAAAAAAAAAk',
    '..kaaaaaarrraaaaaarrraak',
    '..kkkkkkkrrrkkkkkkrrrkk',
    '..kAAAAAAAAAAAAAAAAAAAAk',
    '..kaaaaaarrraaaaaarrraak',
    '..kkkkkkkrrrkkkkkkrrrkk',
    '..kAAAAAAAAAAAAAAAAAAAAk',
    '..kaaaaaarrraaaaaarrraak',
    '...kkkkkkkkkkkkkkkkkkkk',
  ]),
  // Maçarico: long nozzle with a pilot flame, fuel tank slung under, rubber grip
  macarico: grid([
    '',
    '',
    '',
    '.......kkkkkkkkkkkkkkkkkkkk',
    '......kdMMMMMMMMMMMMMMMMMMdk.yA',
    '.....kddmmmmmmmmmmmmmmmmmmdkkyAa',
    '.....kdddddddddddddddddddddk.aA',
    '.....kkkkkkkkkkkkkkkkkkkkkk',
    '......kcck..kaaaaaaaaaaak',
    '......kcck.kaAAAAAAAAAAAak',
    '.....kccck.kaaaaaaaaaaaaak',
    '.....kcck...kaaaaaaaaaaak',
    '.....kkk.....kkkkkkkkkkk',
  ]),
  // Lança-CD: a chunky launcher with a big shiny disc loaded on top
  disco: grid([
    '',
    '',
    '...............kkkkkkkk',
    '.............kkMMMMMMMMkk',
    '............kMbbAbbbbbbMk',
    '...kkkkkkkkkbbAkkkkbbbbbbk',
    '..kddddddddkbAbkbbkbbbbbbk',
    '..kdmmmmmmmkbbbkkkkbbbbbbk',
    '..kddddddddkbbbbbbbbbbbAbk',
    '...kkkcckkkkMbbbbbbbbbAbk',
    '.....kcck....kkbbbbbbbbkk',
    '.....kcck......kkkkkkkk',
    '....kccck',
    '....kcck',
    '....kkk',
  ]),
  // Corrente.exe: coil gun with a glowing cell, a zigzag of lightning leaping off the front
  corrente: grid([
    '',
    '',
    '..........kk',
    '.........kAak',
    '.........kaAk.................A',
    '......kkkkkkkkkkkkkkk........A.A',
    '.....kddddrrrrrrrdddk..A....A',
    '.....kdmmmrMrMrMrmmmkkA.A..A',
    '.....kddddrrrrrrrdddk...A.A',
    '......kkkkkkkkkkkkkkk....A',
    '.......kcck',
    '.......kcck',
    '......kccck',
    '......kcck',
    '......kkk',
  ]),
  pistols: [],
};

/** Pads a short-hand grid to the full 32×16 sprite. */
function grid(rows: string[]): string[] {
  const out = rows.map((r) => r.padEnd(SPRITE_W, '.').slice(0, SPRITE_W));
  while (out.length < SPRITE_H) out.push('.'.repeat(SPRITE_W));
  return out;
}

const MEDKIT_SPRITE = [
  '................................',
  '................................',
  '............kkkkkkkk............',
  '............kddddddk............',
  '.......kkkkkkkkkkkkkkkkkk.......',
  '.......kMMMMMMMMMMMMMMMMk.......',
  '.......kmmmmmmmaammmmmmmk.......',
  '.......kmmmmmmmaammmmmmmk.......',
  '.......kmmmmmaaaaaammmmmk.......',
  '.......kmmmmmaaaaaammmmmk.......',
  '.......kmmmmmmmaammmmmmmk.......',
  '.......kmmmmmmmaammmmmmmk.......',
  '.......kddddddddddddddddk.......',
  '.......kkkkkkkkkkkkkkkkkk.......',
  '................................',
  '................................',
];

interface SpriteRun {
  x: number;
  y: number;
  w: number;
  fill: string;
}

const spriteCache = new Map<string, SpriteRun[]>();

/** Converts a char grid into horizontal colour runs, plus an auto-generated 1px outline. */
function buildSpriteRuns(grid: readonly string[], accent: string, accentHi: string, key: string): SpriteRun[] {
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = { ...BASE_PALETTE, a: accent, A: accentHi, K: '#121318' };
  const filled = (x: number, y: number) => {
    if (y < 0 || y >= SPRITE_H || x < 0 || x >= SPRITE_W) return false;
    const ch = grid[y]?.[x];
    return ch !== undefined && ch !== '.' && palette[ch] !== undefined;
  };

  // Resolve every cell to a colour (or null), including the generated outline ring.
  const cells: (string | null)[][] = [];
  for (let y = -1; y <= SPRITE_H; y++) {
    const row: (string | null)[] = [];
    for (let x = -1; x <= SPRITE_W; x++) {
      if (filled(x, y)) {
        row.push(palette[grid[y][x]]);
      } else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        row.push(OUTLINE_HEX);
      } else {
        row.push(null);
      }
    }
    cells.push(row);
  }

  const runs: SpriteRun[] = [];
  cells.forEach((row, ry) => {
    let rx = 0;
    while (rx < row.length) {
      const fill = row[rx];
      if (!fill) {
        rx++;
        continue;
      }
      let len = 1;
      while (rx + len < row.length && row[rx + len] === fill) len++;
      runs.push({ x: rx - 1, y: ry - 1, w: len, fill });
      rx += len;
    }
  });

  spriteCache.set(key, runs);
  return runs;
}

const WEAPON_ACCENTS: Record<WeaponId, [string, string]> = {
  pistol: ['#ff2a1f', '#ffb0a0'],
  pistols: ['#ff2a1f', '#ffb0a0'],
  shotgun: ['#ff2a1f', '#ffb0a0'],
  plasma: ['#1fb8c9', '#bff8ff'],
  railgun: ['#8fd11f', '#eaffc2'],
  rocket: ['#ff2a1f', '#ffb0a0'],
  katana: ['#4e5057', '#9a9ca3'],
  hammer: ['#ff2a1f', '#ffb0a0'],
  nailgun: ['#c8902a', '#ffd27a'],
  harpoon: ['#8a7048', '#d0b080'],
  forkbomb: ['#3fd96a', '#d8ffe0'],
  coice: ['#ff2a1f', '#ffb0a0'],
  juiz: ['#c8902a', '#ffd27a'],
  faces: ['#ff1e3c', '#ffffff'],
  rmrf: ['#ff2030', '#ffffff'],
  dinamite: ['#e0281e', '#ff8a6a'],
  macarico: ['#ff8a1a', '#ffe08a'],
  disco: ['#ff5ac8', '#7fe8ff'],
  corrente: ['#2ee6ff', '#e8ffff'],
};

export const WeaponIcon = memo(function WeaponIcon({
  weapon,
  className = 'w-11 h-7',
  dimmed = false,
}: {
  weapon: WeaponId;
  className?: string;
  dimmed?: boolean;
}) {
  const [accent, accentHi] = WEAPON_ACCENTS[weapon];
  const style = dimmed ? { filter: 'grayscale(0.85) brightness(0.7)' } : undefined;
  const src = spriteUrl('weapon:' + weapon, [-1, -1, 34, 18], () => {
    if (weapon === 'pistols') {
      const runs = buildSpriteRuns(WEAPON_SPRITES.pistol, accent, accentHi, 'pistol');
      return [
        ...runs.map((r) => ({ ...r, x: r.x + 3, y: r.y - 2, alpha: 0.55 })),
        ...runs.map((r) => ({ ...r, x: r.x - 2, y: r.y + 1 })),
      ];
    }
    return buildSpriteRuns(WEAPON_SPRITES[weapon], accent, accentHi, weapon);
  });
  return <PixelImg src={src} className={className} style={style} />;
});

export function VitalityPip({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <polygon
        points="12,2 15,8.5 22,9.3 16.8,14 18.2,21 12,17.5 5.8,21 7.2,14 2,9.3 9,8.5"
        fill={filled ? '#ff2a55' : '#261236'}
        stroke="#14081f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {filled && <polygon points="12,5 13.8,9 17,9.5 14.2,12" fill="#ff9ebb" opacity="0.7" />}
    </svg>
  );
}

export const MedKitIcon = memo(function MedKitIcon({ className = 'w-10 h-8' }: { className?: string }) {
  const src = spriteUrl('medkit', [5, 1, 22, 14], () => buildSpriteRuns(MEDKIT_SPRITE, '#4dff7a', '#e0ffe8', 'medkit'));
  return <PixelImg src={src} className={className} />;
});
