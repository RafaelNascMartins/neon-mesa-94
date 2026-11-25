import { memo, type CSSProperties } from 'react';
import { itemPixels } from '../game/itemSprites';
import { renderWeaponIcon } from '../game/weaponIconRender';
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
 * Painted/metal pixels get a stable per-pixel wear (tone noise + rust specks) to match the 3D models;
 * only the `a`/`A` pixels take the weapon's own accent colour.
 * Each weapon gets its own silhouette and uses the full height (drum, bell, keycap, diagonal blade...).
 * ------------------------------------------------------------------------------------------------ */

const SPRITE_W = 32;
const SPRITE_H = 16;
const OUTLINE_HEX = '#050507';

// Shared palette (matches the 3D models: worn paint, rust, iron, hazard stripes); `a`/`A` are per weapon.
const BASE_PALETTE: Record<string, string> = {
  M: '#cfcfc8', // steel highlight
  m: '#8a8a86', // steel
  d: '#4a4744', // iron
  k: '#2e2b2a', // dark iron
  K: '#161414', // black
  W: '#a8683a', // wood highlight
  w: '#7a4426', // wood
  j: '#8a3324', // wrapped cord
  s: '#d6dae2', // blade
  c: '#26262c', // rubber grip
  b: '#d8cfbe', // white paint
  B: '#f0ead8', // white paint highlight
  n: '#c8b48a', // beige
  r: '#c89a3a', // brass
  o: '#d0702a', // orange paint
  O: '#f0a050', // orange highlight
  e: '#b8301e', // red paint
  E: '#e05a3a', // red highlight
  t: '#3a8a80', // teal paint
  T: '#6ac0b0', // teal highlight
  x: '#6a7a48', // olive paint
  y: '#f0bc22', // hazard yellow
  Y: '#ffe070', // yellow highlight
  R: '#8a4a1e', // rust
  q: '#5a2a14', // dark rust / shadow slot
  X: '#ff2a1f', // red glow
  g: '#5dff6a', // green glow
  p: '#8a3ac8', // purple
  P: '#d07aff', // purple glow
  u: '#6ae8ff', // cyan glow
  '1': '#c8b4ff',
  '2': '#9fe8ff',
  '3': '#b8ffd0',
  '4': '#fff7b0',
  '5': '#ffc8e8',
};

/** Paint and metal get pixel wear (tone noise + rust specks); glows, screens and blades stay clean. */
const WORN = new Set('MmdkWwjbBnroOeEtTxyYcR'.split(''));

const WEAPON_SPRITES: Record<WeaponId, string[]> = {
  // Peacemaker: iron frame, cylinder with beige slashes, long barrel, red front sight
  pistol: grid([
    '',
    '',
    '',
    '..............................EE',
    '...kk...kddddkMMMMMMMMMMMMMMMMMM',
    '...kdk.kdnmmndmmmmmmmmmmmmmmmmmm',
    '....kddddmnmmnddddddddddddddddk',
    '....kddddnmmndk',
    '.....kddddddddk',
    '....wWkkd..dk',
    '...wWwk.kddk',
    '...wWwwk',
    '..wWwwk',
    '..wWwwwk',
    '..kwwwk',
  ]),
  // Scattergun: rusted stock with a hazard butt plate, orange shroud with vent slots, ribbed pump
  shotgun: grid([
    '',
    '',
    '',
    '',
    '.............OOOOOOOOOOOOOOOOOOO',
    'yk.........ddoqooqooqooqooqooooo',
    'kyRRRRRRRRRddooooooooooooooooooo',
    'ykRRRqRRRRRdddmmmmmmmmmmmmmmmmmM',
    'kyRRRRRRRRkdddkkkkkkkkkkkkkkkkkk',
    'ykRRR....kdddkdmdmdmdmdmdm',
    '.........kd..kdmdmdmdmdmdm',
    '.........kkdk',
  ]),
  // Coice: red body with a red/white band, twin sawn-off barrels
  coice: grid([
    '',
    '',
    '',
    '',
    '.........EEEEEbebeMMMMMMMMMMMMM',
    '..WW....eeeeeeebebmmmmmmmmmmmmmd',
    '.wwWW...eeeeeeebebkkkkkkkkkkkkkk',
    'wwwwwWWWeeeeeeebebMMMMMMMMMMMMM',
    'wwwwwwwweeeeeeebebmmmmmmmmmmmmmd',
    '.wwwwwwkeedd.dkebkkkkkkkkkkkkkk',
    '......kkkd..dk',
    '........kddk',
  ]),
  // Starburst: orange tube with a beige stripe, flared muzzle with a checker ring, carry handle,
  // yellow canister with hazard bands underneath
  rocket: grid([
    '',
    '..........kkkkkk',
    '..........k....k..........dddd',
    '..OOOOOOOOOOOOOOOOOOOOOOOObKbKd',
    '.dooooooonnoooooooooooooooKbKbdd',
    'ddoooooooonnoooooooooooooobKbKdd',
    'ddooooooooonnooooqqqqooooKbKbddd',
    '.dooooooooooooooooooooooobKbKdd',
    '..qqqqqqqqqqqqqqqqqqqqqqqKbKbd',
    '.......kdk..yykyykyy......dddd',
    '.......kdk..yyyyyyyy',
    '.......kddk.ykkyykky',
    '........kk..yyyyyyyy',
  ]),
  // Pregadeira: yellow tool body, hazard band, black nose, nail magazine
  nailgun: grid([
    '',
    '',
    '',
    '....YYYYYYYYYYYYYYYYYY',
    '...yyyyyyyyykykykykyyykkkkk',
    '..yyyyyyyyyyykykykykyyykkkkkkkMM',
    '..yyyyyyyyyykykykykyykkkkkkkkkmm',
    '...yyyyyyyyyyyyyyyyyykkkkkk',
    '....kk.cccyy..ddddddddd',
    '.......cccy...mdmdmdmdm',
    '.......ccck...ddddddddd',
    '......ccck',
    '......yyyy',
  ]),
  // Lança-CD: two-handed white launcher, rainbow disc on top, red >>> arrows, green LED, loop stock
  disco: grid([
    '',
    '..........12345123',
    '.........3451234512',
    '........r23451k23451r',
    '..bb....BBBBBBBBBBBBBBBBBBBBBBB',
    '.b..b..bbbbbbbbbbbbbbbbbbbbbbbbk',
    'b....bbbbeebbeebbeebbbbbbbbbbbkk',
    'b....bbbbbeebbeebbeebbbbbbbbbgbk',
    '.b..bbbbbeebbeebbeebbbbbbbbbbbkk',
    '..bb..dddbbbbbbbbbbbbbbbbbbbbbk',
    '.......kcck..........kcck',
    '.......kcck..........kcck',
    '........kk............kk',
  ]),
  // Canhão de Faces: a CRT on the front with the screaming green face, hazard band, checker
  // panel, red/purple cables, loop stock
  faces: grid([
    '',
    '....................dddddddddd',
    '...................dkkkkkkkkkkd',
    '...................dkggggggggkd',
    '..mm.......yykyykydkgkkggkkgkd',
    '.m..m...mmmmmmmmmmdkgkkggkkgkd',
    'm....mmmmbKbKmmmmmdkggggggggkdM',
    'm....mmmmKbKbmmmmmdkgggkkgggkdM',
    '.m..mmmmmmmmmmmmmmdkkggkkggkkd',
    '..mm..eeepppmmmmmmdkkkkkkkkkkd',
    '.....e.kcck.pp.....dddddddddd',
    '....e..kcck..p',
    '........kk',
  ]),
  // fork(): olive body, process-tree screen, a ring of blocks round a brass hub, green orbs
  forkbomb: grid([
    '',
    '.......................g..g',
    '.....................kdk.kdk.g',
    '...........kkkkk....kd....dk',
    '..xx.......kgggk...kd.rrr.dkg',
    '.x..x..xxxxkgkgkxxxxd.rmr.dk',
    'x....xxxxxxkgggkxxxxd.rrr.dk',
    'x....xxxxxxxxxxxxxxxkd....dk.g',
    '.x..xxxxxxxxxxxxxxxxxkdk.kdk',
    '..xx..dddxxxxxxxxxxxx..g..g',
    '.......kcck.....kcck',
    '.......kcck.....kcck',
    '........kk.......kk',
  ]),
  // Revólver Juiz: white revolver, drum with red glow slots, red slashes, sheriff star on the grip
  juiz: grid([
    '',
    '',
    '',
    '..............................ee',
    '...kk...BBBBBBBBBBBBBBBBBBBBBBBB',
    '...kbk.bddXdXdbbbbbebbebbebbbbbb',
    '....kbbbdXdXdddbbbbbbbbbbbbbbbbk',
    '....kbbbddddddkXkkkXkkkXkkkkkkk',
    '.....kbbbbbbbbk',
    '....bbekkb..bk',
    '...beeek.kbbk',
    '...bbebbk',
    '..bbbbbk',
    '..bbbbbbk',
    '..kbbbbk',
  ]),
  // Sunfire: orange body with the sun emblem, violet plasma tube caged in orange rings, cyan cells
  plasma: grid([
    '',
    '',
    '..............o...o...o...o',
    '....OOOOOOOOOoPoPPoPPoPPoPPoddd',
    '...oooYoooooooupuuopuuopuuopuddd',
    '..ooYYYoooooopPPPPoPPPPoPPPPomMm',
    '..oooYooooooopPPPPoPPPPoPPPPomMm',
    '...ooooooooooupuuopuuopuuopudddd',
    '...ddddddddddoPoPPoPPoPPoPPoddd',
    '....kk.kcck..o...o...o...o',
    '.......kcck..uu.uu',
    '.......kcck',
    '........kk',
  ]),
  // Volt: white body with a checker panel, battery drum with hazard + brass bands, two prongs
  // with green current between them
  railgun: grid([
    '',
    '',
    '',
    '..........rrrrr.....dddddddddddyk',
    '....bbbbbbkyykkbbbbdggggggggggykk',
    '..bbbbbbbbkkyykbbbb....g..g...g',
    '..bbKbKbbbkyykkbbbb..g..g..g..',
    '..bbbKbKbbkkyykbbbb....g..g...g',
    '...bbbbbbbkyykkbbbbdggggggggggykk',
    '....kk.kckrrrrr....dddddddddddyk',
    '.......kcck',
    '........kk',
  ]),
  // Katana: wrapped hilt with dark diamonds, brass pommel, dark tsuba, gently curved blade
  katana: grid([
    '',
    '',
    '',
    '',
    '',
    '..............kk..............MM',
    '..............kk.........MMMMMss',
    '.rjkjkjkjkjkj.kkMMMMMMMMMssssss',
    'rrjjkjjkjjkjjkkkssssssssssssmm',
    '.rjkjkjkjkjkj.kkmmmmmmmmmmm',
    '..............kk',
    '..............kk',
  ]),
  // Marreta: taped wooden handle, octagonal iron head with red faces and brass bands
  hammer: grid([
    '',
    '.....................eeeeee',
    '....................eEEEEEEe',
    '....................dmmmmmmd',
    '...................dmMMMMMMmd',
    '...................rrrrrrrrrr',
    '.wwWWnnwwWWwwnnwwWWdmmkkmmmmd',
    '.wwwwnnwwwwwwnnwwwwdmmkkmmmmd',
    '...................rrrrrrrrrr',
    '...................dmmmmmmmmd',
    '....................dddddddd',
    '....................eEEEEEEe',
    '.....................eeeeee',
  ]),
  // Arpão: teal body, rope reel on top, hazard band, rusted shaft with a barbed head
  harpoon: grid([
    '',
    '',
    '',
    '..........nnnn',
    '.........nWnnWn...........m',
    '...TTTTTTnnnnnnTTTyky......mm',
    '..tttttttnnnnnntttkykRRRRRRRmMMM',
    'tttttttttttttttttyky.......mm',
    'tt.tttttdkcckttttkyk.......m',
    '.......kcck',
    '.......kcck',
    '........kk',
  ]),
  // rm -rf /: white box with black fins, hazard band, front frame with the red screen, red hose
  rmrf: grid([
    '',
    '',
    '.....kkkkkkk',
    '....BBBBBBBBBBBBBByykyykdddddd',
    '...bbkbkbkbkbbbbbbkyykydXXXXXd',
    '..bbbkbkbkbkbbbbbbyykyykdXXXXXd',
    '..bbbkbkbkbkbbbbbbkyykydXXXXXd',
    '..bbbbbbbbbbbbbbbbyykyykdXXXXXd',
    '..bbbbbbbbbbbbbbbbkyykydddddd',
    '..eee.kcck.........ee',
    '.e..e.kcck........e',
    '.e...eekk......eee',
    '..ee....eeeeee',
  ]),
  // Dinamite: five sticks bound with iron straps, rope fuse, glowing tip
  dinamite: grid([
    '.........................A',
    '........................aXa',
    '.......................n.A',
    '....................nnn',
    '...EEEdEEEEEEEEEdEEEEn',
    '...eeedeeeeeeeeedeeee',
    '..EEEEdEEEEEEEEEdEEEEE',
    '..eeeedeeeeeeeeedeeeee',
    '..EEEEdEEEEEEEEEdEEEEE',
    '..eeeedeeeeeeeeedeeeee',
    '..EEEEdEEEEEEEEEdEEEEE',
    '..eeeedeeeeeeeeedeeeee',
    '...EEEdEEEEEEEEEdEEEE',
    '...eeedeeeeeeeeedeeee',
  ]),
  // Maçarico: orange body with a loop handle, white tank on top, bent nozzle, pilot flame
  macarico: grid([
    '',
    '.......bbbb',
    '......bBBBBb',
    '......bbbbbb...................A',
    '......bbbbbb................ddaA',
    '..oo..bbbbbb...............dmda',
    '.o..o.bbbbbbooooooooooddddddd',
    'o....oOOOOOOOOOOOOOOOmmmmmmmm',
    'o....oooooooooooooooomdddd',
    '.o..ooooqqqqoooooooood',
    '..oo..kcck..dd',
    '......kcck..dd',
    '.......kk',
  ]),
  // Corrente.exe: dark body with a purple vent, purple coil with brass rings, white claws, arc + orb
  corrente: grid([
    '',
    '...........................bb',
    '.........................bb.P',
    '.....dddddddd..rprprprbbbb..pP',
    '...ddddppppddddrprprprbbbBb.PPP',
    '..dddddPPPPddddrPrPrPrbbbbb.pPPp',
    '..dddddppppddddrprprprbbbBb.PPP',
    '...dddddddddddddrprprprbbbb..pP',
    '...ee..kcck..........bb.P',
    '..e..e.kcck............bb',
    '..e...eekk',
  ]),
  // Besta: wooden stock, iron tiller, wide steel limbs across the front, crank and a loaded bolt
  besta: grid([
    '',
    '.......................mm',
    '......................mMd',
    '.....................mMd',
    '.....................Md',
    '..WW.......kdk......kd',
    '.wwWWWWWWWWWWWWWWWWWWWWWWnnnnmMM',
    'wwwwwwwwwwwwwwwwwwwkkkkkkkkkkk',
    '.wwwwwwwkddkwwwwwwwwkd',
    '..ww....kddk........Md',
    '........kcck........mMd',
    '........kcck.........mMd',
    '.........kk...........mm',
  ]),
  // Arco: wrapped grip, two curved limbs, the string pulled to the arrow's nock
  arco: grid([
    '..............ww',
    '...............wW',
    '................wW',
    '.................wW',
    '..................ww',
    '..................ww',
    'nnK........b......jj.........M',
    'bbbmmmmmmmmmmmmmmmjjmmmmmmmmmMMM',
    'nnK........b......jj.........M',
    '..................ww',
    '..................ww',
    '.................wW',
    '................wW',
    '...............wW',
    '..............ww',
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

  const palette: Record<string, string> = { ...BASE_PALETTE, a: accent, A: accentHi };
  let seed = 7;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  /** Worn pixel: per-pixel tone noise and the odd rust speck, stable per weapon. */
  const wear = (ch: string, x: number, y: number) => {
    const base = palette[ch];
    if (!WORN.has(ch)) return base;
    let h = (seed ^ Math.imul(x + 11, 73856093) ^ Math.imul(y + 5, 19349663)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const r = (h & 0xffff) / 0xffff;
    if (r < 0.06 && ch !== 'R' && ch !== 'k' && ch !== 'c') return r < 0.025 ? '#4a2412' : '#8a4a1e';
    const k = 0.9 + ((h >>> 16) & 0xff) / 255 * 0.18;
    const n = parseInt(base.slice(1), 16);
    const c = (v: number) => Math.min(255, Math.round(v * k));
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };
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
        row.push(wear(grid[y][x], x, y));
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
  shotgun: ['#ff7a2a', '#ffd0a0'],
  plasma: ['#c05aff', '#6ae8ff'],
  railgun: ['#5dff6a', '#eaffc2'],
  rocket: ['#ff7a2a', '#ffe08a'],
  katana: ['#4e5057', '#9a9ca3'],
  hammer: ['#ff2a1f', '#ffb0a0'],
  nailgun: ['#f0bc22', '#ffe070'],
  harpoon: ['#3a8a80', '#6ac0b0'],
  forkbomb: ['#3fd96a', '#d8ffe0'],
  coice: ['#ff2a1f', '#ffb0a0'],
  juiz: ['#ff2a1f', '#ffb0a0'],
  faces: ['#5dff6a', '#ffffff'],
  rmrf: ['#ff2030', '#ffffff'],
  dinamite: ['#ff8a1a', '#ffe08a'],
  macarico: ['#ff8a1a', '#ffe08a'],
  disco: ['#ff5ac8', '#7fe8ff'],
  corrente: ['#c05aff', '#f0d8ff'],
  besta: ['#c89a3a', '#ffe08a'],
  arco: ['#f0ead8', '#ffffff'],
};

export const WeaponIcon = memo(function WeaponIcon({
  weapon,
  className = 'w-11 h-7',
  dimmed = false,
  empty = false,
}: {
  weapon: WeaponId;
  className?: string;
  dimmed?: boolean;
  /** Out of ammo: stays in the inventory, switched off. */
  empty?: boolean;
}) {
  const [accent, accentHi] = WEAPON_ACCENTS[weapon];
  const style = empty
    ? { filter: 'grayscale(1) brightness(0.32)', opacity: 0.75 }
    : dimmed
      ? { filter: 'grayscale(0.85) brightness(0.7)' }
      : undefined;
  // Rendered from the 3D model (64×32 pixel art); the hand-drawn 32×16 sprite if WebGL fails
  const src = renderWeaponIcon(weapon) ?? spriteUrl('weapon:' + weapon, [-1, -1, 34, 18], () => {
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
